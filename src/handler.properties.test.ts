import fc from "fast-check";
import { describe, it } from "vitest";
import { createHandler } from "./handler.js";
import {
  convergesAfterRetries,
  isIdempotent,
  isOrderIndependent,
  neverThrows,
  poisonNeverAffectsState,
  reportsExactlyTheFailures,
} from "./testing/properties.js";

// The correct handler must satisfy every property.
describe("createHandler (properties)", () => {
  const runs = { numRuns: 300 };

  it("reports exactly the failed records", async () => {
    await fc.assert(reportsExactlyTheFailures(createHandler), runs);
  });

  it("never throws", async () => {
    await fc.assert(neverThrows(createHandler), runs);
  });

  it("is idempotent when a batch is delivered twice", async () => {
    await fc.assert(isIdempotent(createHandler), runs);
  });

  it("does not depend on delivery order", async () => {
    await fc.assert(isOrderIndependent(createHandler), runs);
  });

  it("converges to the reference model after retries", async () => {
    await fc.assert(convergesAfterRetries(createHandler), runs);
  });

  it("never lets poison messages affect state", async () => {
    await fc.assert(poisonNeverAffectsState(createHandler), runs);
  });
});
