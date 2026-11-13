---
"@homeostate/core": minor
"@homeostate/store-zustand": patch
"@homeostate/store-redux": patch
"@homeostate/store-mobx": patch
"@homeostate/store-mobx-state-tree": patch
"@homeostate/store-jotai": patch
"@homeostate/tool-devtools": patch
"@homeostate/tool-simulator": patch
---

**Breaking:** a smaller sync engine API, with one way to do each thing. Migrate as follows:

- `SyncEngine` drops `isConnected()` and `isReady()`, which returned what `getStatus()` holds.
  Replace `engine.isConnected()` with `engine.getStatus().connected`, and `engine.isReady()` with
  `engine.getStatus().ready`. This also applies to the engine that Zustand's and Redux's
  `store.homeostate`, `syncMobxStore` and `syncStateTree` return. An object that implements
  `SyncEngine` by hand can drop both methods.
