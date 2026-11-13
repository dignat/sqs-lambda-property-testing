import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import fc from "fast-check";
import { expect } from "vitest";
import { InMemoryOrderStore, type OrderStore } from "../order-store.js";
import { sqsEvent } from "./sqs-event.js";
import {
  expectedFailures,
  expectedOrders,
  scenario,
  scenarioWithShuffle,
  type Message,
} from "./scenario.js";

export type HandlerFactory = (
  store: OrderStore,
) => (event: SQSEvent) => Promise<SQSBatchResponse>;

const toEvent = (messages: readonly Message[]) =>
  sqsEvent(messages.map(({ messageId, body }) => ({ messageId, body })));

const failedIds = (response: SQSBatchResponse | void) =>
  (response?.batchItemFailures ?? []).map((f) => f.itemIdentifier).sort();

/**
 * Property 1: the handler reports exactly the records that failed, and
 * nothing else. Missing ids mean lost messages; extra ids mean needless
 * retries. A failing record must not change how its neighbours are handled.
 */
export const reportsExactlyTheFailures = (makeHandler: HandlerFactory) =>
  fc.asyncProperty(scenario, async (s) => {
    const handler = makeHandler(new InMemoryOrderStore(s.failOn));
    const response = await handler(toEvent(s.messages));
    expect(failedIds(response)).toEqual(expectedFailures(s).sort());
  });

/** Property 2: the handler never throws, whatever the batch contains. */
export const neverThrows = (makeHandler: HandlerFactory) =>
  fc.asyncProperty(scenario, async (s) => {
    const handler = makeHandler(new InMemoryOrderStore(s.failOn));
    await expect(handler(toEvent(s.messages))).resolves.toBeDefined();
  });

/**
 * Property 3: delivering the same batch twice changes nothing the second
 * time (at-least-once delivery must be safe).
 */
export const isIdempotent = (makeHandler: HandlerFactory) =>
  fc.asyncProperty(scenario, async (s) => {
    const store = new InMemoryOrderStore();
    const handler = makeHandler(store);
    await handler(toEvent(s.messages));
    const afterOnce = store.snapshot();
    await handler(toEvent(s.messages));
    expect(store.snapshot()).toEqual(afterOnce);
  });

/**
 * Property 4: delivery order does not matter (standard queues do not
 * guarantee order).
 */
export const isOrderIndependent = (makeHandler: HandlerFactory) =>
  fc.asyncProperty(scenarioWithShuffle, async ({ scenario: s, shuffled }) => {
    const inOrder = new InMemoryOrderStore();
    await makeHandler(inOrder)(toEvent(s.messages));
    const reordered = new InMemoryOrderStore();
    await makeHandler(reordered)(toEvent(shuffled));
    expect(reordered.snapshot()).toEqual(inOrder.snapshot());
  });

/**
 * Property 5: simulate SQS retries. After an outage the failed messages are
 * redelivered, and the orders converge to the reference model: every distinct
 * valid event applied exactly once, poison never applied.
 */
export const convergesAfterRetries = (makeHandler: HandlerFactory) =>
  fc.asyncProperty(scenario, async (s) => {
    const store = new InMemoryOrderStore(s.failOn);
    const handler = makeHandler(store);

    const first = await handler(toEvent(s.messages));
    store.heal(); // the outage ends
    const retryIds = new Set(failedIds(first));
    const redelivery = s.messages.filter((m) => retryIds.has(m.messageId));
    await handler(toEvent(redelivery));

    expect(store.snapshot()).toEqual(expectedOrders(s.messages));
  });

/** Property 6: poison messages never leak into state. */
export const poisonNeverAffectsState = (makeHandler: HandlerFactory) =>
  fc.asyncProperty(scenario, async (s) => {
    const store = new InMemoryOrderStore();
    await makeHandler(store)(toEvent(s.messages));
    expect(store.snapshot()).toEqual(expectedOrders(s.messages));
  });
