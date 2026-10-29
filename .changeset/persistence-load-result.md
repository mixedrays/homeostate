---
"@homeostate/core": minor
---

Resolve `whenLoaded` with a `PersistenceLoadResult` describing the initial load. Before, it
resolved with `undefined` after a successful, empty, failed or partial restoration alike, so an
app that awaited it and connected its sync engine could seed defaults over a stored log it had
failed to read, without telling that apart from a first visit.

- `{ status: "empty" }`: nothing is stored under the key, even if the document already holds
  state.
- `{ status: "loaded" }`: every stored update was applied.
- `{ status: "partial", errors }`: the log was read, but at least one stored update could not be
  applied; `errors` holds what `apply` threw for each, in log order.
- `{ status: "failed", error }`: storage could not be read; `error` is what the adapter's `load`
  rejected with.

The errors are the objects `onError` received during the initial load, which is still called as
before; errors of later appends and compactions are not included. `whenLoaded` still never
rejects, and still resolves before the initial snapshot is written: a failed initial snapshot
leaves the result as it was and makes `flush()` reject. `PersistenceLoadResult` is exported from
`@homeostate/core`.

Breaking: `Persistence.whenLoaded` is now `Promise<PersistenceLoadResult>` instead of
`Promise<void>`. Code that only awaits it needs no change. Code that returns or assigns it where
a `Promise<void>` is expected no longer type-checks: type it as
`Promise<PersistenceLoadResult>`, or pass `whenLoaded.then(() => {})`. To stop seeding defaults
over a log that could not be restored, connect only for `"empty"` and `"loaded"`.
