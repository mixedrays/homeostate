---
"@homeostate/core": patch
---

Keep a stored log that holds updates the document cannot apply. Before, `createPersistence`
reported such an update to `onError`, applied the rest, then compacted the log into a snapshot
of the document, which deleted the update, so damaged bytes, or another CRDT library's
document under a reused key, could no longer be inspected or recovered. Now the initial load,
automatic compaction and `compact()` leave the log in place whenever an update in it fails to
apply; the error still goes to `onError` on each attempt, and `whenLoaded` resolves with the
other updates applied. The initial load appends a snapshot of the document instead, so what it
held before it was persisted is still stored. `clear()` deletes such a log, after which
compaction resumes. `PersistableDoc.apply` is now documented to throw for bytes it cannot apply.
