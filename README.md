# sqs-lambda-property-testing

Companion repo for an article on property-based testing of an SQS-triggered
AWS Lambda with [fast-check](https://github.com/dubzzz/fast-check).

## Run

```sh
nvm use
pnpm install
pnpm test
pnpm typecheck
```

## Layout

| File | Role |
| --- | --- |
| `src/order-event.ts` | Zod schema for the message contract |
| `src/order-core.ts` | Pure business logic (commutative, no I/O) |
| `src/order-store.ts` | `OrderStore` interface and in-memory fake with outage simulation |
| `src/handler.ts` | Correct handler using partial batch responses |
| `src/buggy-handler.ts` | The planted bug: `break` on first failure silently drops the rest |
| `src/testing/scenario.ts` | Generators (duplicates, poison, outages) and the reference model |
| `src/testing/properties.ts` | The six properties |
| `src/example-based.test.ts` | Ordinary tests that pass on the buggy handler too |
| `src/handler.properties.test.ts` | Properties against the correct handler |
| `src/planted-bug.test.ts` | Properties against the buggy handler: must fail, with shrunk counterexamples |

See the counterexamples fast-check finds:

```sh
pnpm vitest run src/planted-bug.test.ts --reporter=verbose --silent=false
```

The handler needs `ReportBatchItemFailures` enabled on the event source mapping.
