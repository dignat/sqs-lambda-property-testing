import type { OrderEvent } from "./order-event.js";

export interface OrderState {
  totalCents: number;
  cancelled: boolean;
}

export const emptyOrder: OrderState = { totalCents: 0, cancelled: false };

/**
 * Pure business logic: no I/O, no AWS types. The handler is a thin wrapper
 * around this, which is what makes the whole thing easy to test.
 *
 * Both fields are updated in a commutative way (a sum, and a sticky flag), so
 * the final state does not depend on the order events arrive in. SQS standard
 * queues do not guarantee order, so we want this to be true.
 */
export function applyEvent(state: OrderState, event: OrderEvent): OrderState {
  switch (event.type) {
    case "item_added":
      return { ...state, totalCents: state.totalCents + event.amountCents };
    case "cancelled":
      return { ...state, cancelled: true };
  }
}
