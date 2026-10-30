---
"@homeostate/store-mobx": minor
---

Set up sync with one call. `syncMobxStore(store, { backend, ...options })` creates the store
adapter and the sync engine, connects before it returns, and returns the engine:

```ts
export const engine = syncMobxStore(todoStore, { backend, omit: ["draft"] });

engine.disconnect();
```

The options are the ones every setup helper takes: the `backend`, the `connect` mode and the sync
engine's config (`filter`, `seed`, `schedule`, `onError`), with the store adapter's `keys` or
`omit`, whose names are checked against the store as in `createMobxAdapter`. With
`connect: "manual"`, the helper lists the store's fields when it is called unless `keys` names
them, and no state is read or written until the app calls `engine.connect()`. The options type is
exported as `SyncMobxStoreOptions`.
