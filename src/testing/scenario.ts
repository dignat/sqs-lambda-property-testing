import fc from "fast-check";
import type { OrderState } from "../order-core.js";
import type { OrderEvent } from "../order-event.js";

/** One message in a batch. The tag is our oracle: we know what it should do. */
export type RecordSpec =
  | { kind: "valid"; event: OrderEvent }
  | { kind: "poison"; body: string };

export interface Message {
  messageId: string;
  spec: RecordSpec;
  body: string;
}

export interface Scenario {
  /** The batch, in delivery order. May contain duplicates and poison. */
  messages: Message[];
  /** Event ids whose first processing attempt hits a simulated outage. */
  failOn: Set<string>;
}

const orderEvent: fc.Arbitrary<OrderEvent> = fc.record({
  eventId: fc.nat(99).map((n) => `evt-${n}`),
  // Few order ids on purpose, so events collide on the same order.
  orderId: fc.constantFrom("order-1", "order-2", "order-3"),
  type: fc.constantFrom("item_added" as const, "cancelled" as const),
  amountCents: fc.integer({ min: 0, max: 10_000 }),
});

/** Bodies that no retry can ever fix. */
const poisonBody: fc.Arbitrary<string> = fc.constantFrom(
  "not json at all",
  "",
  "null",
  "[]",
  "{}",
  '{"orderId":"order-1"}',
  '{"eventId":"x","orderId":"order-1","type":"item_added","amountCents":-5}',
  '{"eventId":"x","orderId":"order-1","type":"item_added","amountCents":1.5}',
  '{"eventId":"x","orderId":"order-1","type":"refund","amountCents":1}',
);

export const scenario: fc.Arbitrary<Scenario> = fc
  .uniqueArray(orderEvent, {
    selector: (e) => e.eventId,
    minLength: 1,
    maxLength: 6,
  })
  .chain((pool) =>
    fc.record({
      // Drawing from a small pool is what produces duplicate deliveries.
      specs: fc.array(
        fc.oneof(
          {
            weight: 4,
            arbitrary: fc
              .constantFrom(...pool)
              .map((event): RecordSpec => ({ kind: "valid", event })),
          },
          {
            weight: 1,
            arbitrary: poisonBody.map(
              (body): RecordSpec => ({ kind: "poison", body }),
            ),
          },
        ),
        { minLength: 1, maxLength: 10 },
      ),
      failOn: fc
        .subarray(pool.map((e) => e.eventId))
        .map((ids) => new Set(ids)),
    }),
  )
  .map(({ specs, failOn }) => ({
    messages: specs.map((spec, i) => ({
      messageId: `msg-${i}`,
      spec,
      body: spec.kind === "valid" ? JSON.stringify(spec.event) : spec.body,
    })),
    failOn,
  }));

/** A scenario plus a shuffled copy of its messages. */
export const scenarioWithShuffle: fc.Arbitrary<{
  scenario: Scenario;
  shuffled: Message[];
}> = scenario.chain((s) =>
  fc
    .shuffledSubarray(s.messages, {
      minLength: s.messages.length,
      maxLength: s.messages.length,
    })
    .map((shuffled) => ({ scenario: s, shuffled })),
);

/**
 * Reference model: what the orders must look like once every distinct valid
 * event has been applied exactly once.
 *
 * Written independently of the store AND of `applyEvent`: it states the
 * business rules directly (total = sum of item_added amounts, cancelled = any
 * cancelled event) instead of reusing the production function, so a bug in
 * `applyEvent` cannot cancel itself out.
 */
export function expectedOrders(
  messages: readonly Message[],
  include: (event: OrderEvent) => boolean = () => true,
): Record<string, OrderState> {
  const distinct = new Map<string, OrderEvent>();
  for (const { spec } of messages) {
    if (spec.kind !== "valid" || !include(spec.event)) continue;
    if (!distinct.has(spec.event.eventId)) {
      distinct.set(spec.event.eventId, spec.event);
    }
  }

  const orders: Record<string, OrderState> = {};
  for (const event of distinct.values()) {
    const order = (orders[event.orderId] ??= {
      totalCents: 0,
      cancelled: false,
    });
    if (event.type === "item_added") order.totalCents += event.amountCents;
    if (event.type === "cancelled") order.cancelled = true;
  }
  return Object.fromEntries(
    Object.entries(orders).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** Message ids that must be reported as failures on a first delivery. */
export function expectedFailures(s: Scenario): string[] {
  return s.messages
    .filter(
      ({ spec }) =>
        spec.kind === "poison" || s.failOn.has(spec.event.eventId),
    )
    .map((m) => m.messageId);
}
