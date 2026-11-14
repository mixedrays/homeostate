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
