import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { parseOrderEvent } from "./order-event.js";
import type { OrderStore } from "./order-store.js";

/**
 * SQS-triggered handler using partial batch responses.
 *
 * Contract:
 *  - Never throws. A throw would make SQS retry the whole batch.
 *  - Every record that fails (poison message or transient error) is reported
 *    in `batchItemFailures`. SQS retries those and deletes the rest.
 *  - A failing record never affects the other records in the batch.
 *
 * Requires `ReportBatchItemFailures` on the event source mapping.
 */
export function createHandler(store: OrderStore) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];

    for (const record of event.Records) {
      try {
        await store.recordEvent(parseOrderEvent(record.body));
      } catch {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
}
