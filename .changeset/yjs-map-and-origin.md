---
"@homeostate/crdt-yjs": minor
---

`createYjsBackend` returns a `YjsBackend`, a `CrdtBackend` with two more members: `map`, the
synced `Y.Map`, and `origin`, which tags every transaction its `write` runs. Track that origin
with `Y.UndoManager` to undo and redo the store's own edits:

```ts
const backend = createYjsBackend(doc, "shared");
createSyncEngine(backend, adapter).connect();
const undoManager = new Y.UndoManager(backend.map, {
  trackedOrigins: new Set([backend.origin]),
});
```

`createYjsBackend(map, options)` syncs a `Y.Map` you already have, such as one nested in another
map or in a subdocument; a map that is not part of a document throws a `TypeError`. The new
`origin` option sets the origin, which must be unique to the backend; it defaults to a private
Symbol, as before.
