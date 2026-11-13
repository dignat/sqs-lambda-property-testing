import { applyEvent, emptyOrder, type OrderState } from "./order-core.js";
import type { OrderEvent } from "./order-event.js";

/**
 * What the handler needs from persistence.
 *
 * `recordEvent` must be atomic: it records the eventId and updates the order
 * together, or does neither. In DynamoDB that is one TransactWriteItems call:
 * a Put on an idempotency item with `attribute_not_exists(pk)`, plus an Update
 * on the order item. A failed condition means "duplicate".
 */
export interface OrderStore {
  recordEvent(event: OrderEvent): Promise<"applied" | "duplicate">;
}

/**
 * In-memory fake with the same contract as the DynamoDB version.
 * `failOn` simulates transient outages (throttling, timeouts) for specific
 * events. A failing call changes nothing, like a rolled-back transaction.
 */
export class InMemoryOrderStore implements OrderStore {
  private readonly processed = new Set<string>();
  private readonly orders = new Map<string, OrderState>();

  constructor(private failOn: ReadonlySet<string> = new Set()) {}

  /** The outage is over: stop failing. */
  heal(): void {
    this.failOn = new Set();
  }

  async recordEvent(event: OrderEvent): Promise<"applied" | "duplicate"> {
    if (this.failOn.has(event.eventId)) {
      throw new Error(`simulated outage for ${event.eventId}`);
    }
    if (this.processed.has(event.eventId)) return "duplicate";
    this.processed.add(event.eventId);
    const current = this.orders.get(event.orderId) ?? emptyOrder;
    this.orders.set(event.orderId, applyEvent(current, event));
    return "applied";
  }

  /** Deterministic view of all orders, for comparing states in tests. */
  snapshot(): Record<string, OrderState> {
    return Object.fromEntries(
      [...this.orders.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
  }
}
