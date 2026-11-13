import { z } from "zod";

/**
 * The message contract for our SQS queue. Anything that does not match this
 * schema is a "poison message": retrying it can never succeed.
 */
export const OrderEventSchema = z.object({
  eventId: z.string().min(1),
  orderId: z.string().min(1),
  type: z.enum(["item_added", "cancelled"]),
  amountCents: z.number().int().nonnegative(),
});

export type OrderEvent = z.infer<typeof OrderEventSchema>;

/** Parses an SQS message body. Throws on bad JSON or a schema mismatch. */
export function parseOrderEvent(body: string): OrderEvent {
  return OrderEventSchema.parse(JSON.parse(body));
}
