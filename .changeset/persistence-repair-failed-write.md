---
"@homeostate/core": patch
---

Repair storage after a failed persistence write. CRDT updates can depend on earlier ones, so the
updates stored after a failed append could not be restored without it: Yjs, Loro and Automerge
kept them waiting, and a reload reported `'loaded'` but missed every edit since the failure.
`createPersistence` now stores a snapshot of the whole document again with one compaction after
the next append that succeeds, and with one on each `flush()`, and on the `destroy()` call that
stops storing, while the failure is unrepaired. When the log holds an update the document cannot
apply, the snapshot is appended to the kept log instead.

`flush()` and `destroy()` now resolve once that repair succeeds. When it fails too, they reject
with the earliest unrepaired failure's error, as before, and the repair's error goes to
`onError`. A repair that fails is not retried until another append fails or another barrier
runs, so storage that keeps failing causes no retry loop.
