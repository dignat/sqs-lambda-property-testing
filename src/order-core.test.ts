import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyEvent, emptyOrder, type OrderState } from "./order-core.js";
import type { OrderEvent } from "./order-event.js";

const event = (
  type: OrderEvent["type"],
  amountCents: number,
  eventId = "e1",
): OrderEvent => ({ eventId, orderId: "order-1", type, amountCents });

describe("applyEvent (examples)", () => {
  it("adds the amount for item_added", () => {
    expect(applyEvent(emptyOrder, event("item_added", 100))).toEqual({
      totalCents: 100,
      cancelled: false,
    });
  });

  it("accumulates several item_added events", () => {
    const state = [100, 250].reduce(
      (s, amount) => applyEvent(s, event("item_added", amount)),
      emptyOrder,
    );
    expect(state.totalCents).toBe(350);
  });

  it("sets the cancelled flag and keeps the total", () => {
    const start: OrderState = { totalCents: 100, cancelled: false };
    expect(applyEvent(start, event("cancelled", 0))).toEqual({
      totalCents: 100,
      cancelled: true,
    });
  });

  it("ignores amountCents on a cancelled event", () => {
    expect(applyEvent(emptyOrder, event("cancelled", 999)).totalCents).toBe(0);
  });

  it("keeps the cancelled flag once set", () => {
    const cancelled = applyEvent(emptyOrder, event("cancelled", 0));
    expect(applyEvent(cancelled, event("item_added", 50)).cancelled).toBe(true);
  });

  it("does not mutate the input state", () => {
    const start: OrderState = { totalCents: 10, cancelled: false };
    applyEvent(start, event("item_added", 5));
    expect(start).toEqual({ totalCents: 10, cancelled: false });
  });
});

describe("applyEvent (properties)", () => {
  const events = fc.array(
    fc.record({
      eventId: fc.nat(99).map((n) => `evt-${n}`),
      orderId: fc.constant("order-1"),
      type: fc.constantFrom("item_added" as const, "cancelled" as const),
      amountCents: fc.integer({ min: 0, max: 10_000 }),
    }),
    { maxLength: 10 },
  );
  const fold = (list: readonly OrderEvent[]) =>
    list.reduce(applyEvent, emptyOrder);

  it("is commutative: event order does not change the result", () => {
    fc.assert(
      fc.property(
        events.chain((list) =>
          fc
            .shuffledSubarray(list, {
              minLength: list.length,
              maxLength: list.length,
            })
            .map((shuffled) => ({ list, shuffled })),
        ),
        ({ list, shuffled }) => {
          expect(fold(shuffled)).toEqual(fold(list));
        },
      ),
      { numRuns: 300 },
    );
  });
});
