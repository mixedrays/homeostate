---
"@homeostate/crdt-yjs": patch
---

After a peer replaces or deletes the synced map, or a map holding it, the backend's `read` and
`write` now throw. Before, the store's next change emptied the store: the removed map read as
empty, so the engine took it for a remote change that deleted every synced key, and later
changes went into the removed map, which no peer sees. Now the engine reports the change as a
failure with the source `'backend'`, in `onError` and in `SyncStatus.failure`, and the store
keeps its state. Without `onError`, the error propagates from the store change, as for any
backend failure. `onRemoved` is still called once when the removal happens.
