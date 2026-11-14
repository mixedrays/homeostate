---
"@homeostate/crdt-yjs": minor
---

**Breaking:** `createYjsBackend` takes fewer options, keeping one way to do each thing. Migrate as
follows:

- The `origin` option is gone. `subscribe` skips every transaction with the backend's origin, so
  an origin another writer also used, such as `{ origin: "store" }`, silently hid that writer's
  changes from the store. The origin is now always a `Symbol` unique to the backend. Drop the
  option, and read `backend.origin` after creating the backend wherever you passed your own
  value, such as in `Y.UndoManager`'s `trackedOrigins`.
- The `onRemoved` option is gone, and so is its default `console.error` log. When a peer
  replaces the synced map, or a map holding it, a connected engine now reports the removal at
  once through its own error path: `onError` receives an `Error` with the source `'backend'`,
  and `getStatus().failure` holds it. Move your `onRemoved` handling to the engine's `onError`,
  or read `getStatus().failure`; the error's message says that the synced `Y.Map` was removed
  from its document. Without `onError`, the error now propagates from the Yjs update that
  removed the map. As before, connect a new engine over the map that replaced it.
