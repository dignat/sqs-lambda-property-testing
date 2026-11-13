import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { parseOrderEvent } from "./order-event.js";
import type { OrderStore } from "./order-store.js";

/**
 * THE PLANTED BUG. Looks reasonable, passes simple example tests.
 *
 * On the first failure it reports that record and stops. The records after it
 * are neither processed nor reported, so SQS treats them as successful and
 * deletes them. They are silently lost.
 */
export function createBuggyHandler(store: OrderStore) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];

    for (const record of event.Records) {
      try {
        await store.recordEvent(parseOrderEvent(record.body));
      } catch {
        batchItemFailures.push({ itemIdentifier: record.messageId });
        break; // BUG: the rest of the batch is dropped
      }
    }

    return { batchItemFailures };
  };
}
