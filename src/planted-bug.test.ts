import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createBuggyHandler } from "./buggy-handler.js";
import {
  convergesAfterRetries,
  poisonNeverAffectsState,
  reportsExactlyTheFailures,
  type HandlerFactory,
} from "./testing/properties.js";

/**
 * Runs a property against the buggy handler and expects fast-check to find a
 * counterexample. A fixed seed keeps the result reproducible.
 */
async function findCounterexample(
  property: ReturnType<typeof reportsExactlyTheFailures>,
) {
  const details = await fc.check(property, { seed: 42, numRuns: 300 });
  expect(details.failed).toBe(true);
  return details;
}

describe("planted bug (the properties must catch it)", () => {
  const properties: Array<[string, (f: HandlerFactory) => ReturnType<typeof reportsExactlyTheFailures>]> = [
    ["reports exactly the failed records", reportsExactlyTheFailures],
    ["converges to the reference model after retries", convergesAfterRetries],
    ["never lets poison messages affect state", poisonNeverAffectsState],
  ];

  it.each(properties)("catches it: %s", async (_name, makeProperty) => {
    const details = await findCounterexample(makeProperty(createBuggyHandler));
    // Shrinking should have reduced the batch to a tiny failing case.
    console.log(
      `\n[${_name}]\nfound after ${details.numRuns} runs, shrunk ${details.numShrinks} times:\n` +
        fc.stringify(details.counterexample?.[0]),
    );
  });
});
