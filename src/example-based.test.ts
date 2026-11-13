import { describe, expect, it } from "vitest";
import { createBuggyHandler } from "./buggy-handler.js";
import { createHandler } from "./handler.js";
import { InMemoryOrderStore } from "./order-store.js";
import { sqsEvent } from "./testing/sqs-event.js";

const good = (eventId: string, amountCents: number) =>
  JSON.stringify({ eventId, orderId: "order-1", type: "item_added", amountCents });

/**
 * The tests most of us write first. Every one of them PASSES against the
 * buggy handler too, which is the point: they never put a bad record in the
 * middle of a batch.
 */
describe.each([
  ["correct handler", createHandler],
  ["buggy handler", createBuggyHandler],
])("example-based tests: %s", (_name, makeHandler) => {
  it("applies a valid batch", async () => {
    const store = new InMemoryOrderStore();
    const response = await makeHandler(store)(
      sqsEvent([
        { messageId: "a", body: good("e1", 100) },
        { messageId: "b", body: good("e2", 250) },
      ]),
    );
    expect(response.batchItemFailures).toEqual([]);
    expect(store.snapshot()["order-1"]?.totalCents).toBe(350);
  });

  it("reports a poison message at the end of the batch", async () => {
    const store = new InMemoryOrderStore();
    const response = await makeHandler(store)(
      sqsEvent([
        { messageId: "a", body: good("e1", 100) },
        { messageId: "b", body: "not json" },
      ]),
    );
    expect(response.batchItemFailures).toEqual([{ itemIdentifier: "b" }]);
  });

  it("ignores a duplicate delivery", async () => {
    const store = new InMemoryOrderStore();
    const handler = makeHandler(store);
    const batch = sqsEvent([{ messageId: "a", body: good("e1", 100) }]);
    await handler(batch);
    await handler(batch);
    expect(store.snapshot()["order-1"]?.totalCents).toBe(100);
  });
});
