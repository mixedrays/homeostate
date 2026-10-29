---
"@homeostate/core": minor
---

Report persistence failures through the promises of `Persistence` methods. Before, `flush()`,
`compact()`, `destroy()` and `clear()` resolved after failed storage work, so callers had to
track `onError` to learn whether a document was saved or deleted, and an `onError` that threw
left the internal queue rejected, which could surface as unhandled rejections.

- `compact()` and `clear()` reject with their storage error. `clear()` still attempts deletion
  after earlier writes failed, and resolves once the document is removed.
- `flush()` and `destroy()` reject while storage may be missing an update the document
  reported: after a failed append, initial load or initial snapshot, also one that failed
  before the call. They reject with the earliest such error until a compaction writes a
  snapshot of the document, or `clear()` succeeds. A failed automatic compaction, or a stored
  update that cannot be applied, does not make them reject. `destroy()` stops storing even
  when it rejects.
- `onError` is called once per failure, as it happens, and promises reject with the same error
  object. What `onError` throws is logged with `console.error`, and later storage work still
  runs.
- A promise left unawaited never becomes an unhandled rejection. `whenLoaded` still never
  rejects, and `stats()` is unchanged.

Breaking: code that awaits `flush()`, `compact()`, `destroy()` or `clear()` now throws when
storage fails. Wrap those calls in `try`/`catch` where a failure should not stop the caller,
for example on teardown, and drop any error flag kept in `onError` only to tell whether an
operation succeeded. Code that does not await them needs no change.
