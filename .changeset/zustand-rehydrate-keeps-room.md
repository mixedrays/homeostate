---
"@homeostate/store-zustand": patch
---

Calling `store.persist.rehydrate()` on a connected store no longer writes the stored state over
the room. Until now, the middleware waited only for the first hydration, so a later rehydrate,
for example on the window `storage` event or after switching the storage key, set the stored state
as a local edit and every peer adopted it. The store now disconnects while `persist` reads storage
and reconnects once it is hydrated, so the room wins over the rehydrated state as on the first
hydration, and an empty room is seeded with it. If the rehydrate fails, the store reconnects once
`rehydrate()` settles, so a store that was syncing keeps syncing. A store the app disconnected,
before or during the rehydrate, stays disconnected.
