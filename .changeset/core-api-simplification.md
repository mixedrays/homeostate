---
"@homeostate/core": minor
"@homeostate/store-zustand": patch
"@homeostate/store-redux": patch
"@homeostate/store-mobx": patch
"@homeostate/store-mobx-state-tree": patch
"@homeostate/store-jotai": patch
"@homeostate/tool-devtools": patch
"@homeostate/tool-simulator": patch
"@homeostate/react": patch
"@homeostate/store-ngrx-signals": patch
---

**Breaking:** a smaller sync engine API, with one way to do each thing. Migrate as follows:

- `SyncEngine` drops `isConnected()` and `isReady()`, which returned what `getStatus()` holds.
  Replace `engine.isConnected()` with `engine.getStatus().connected`, and `engine.isReady()` with
  `engine.getStatus().ready`. This also applies to the engine that Zustand's and Redux's
  `store.homeostate`, `syncMobxStore` and `syncStateTree` return. An object that implements
  `SyncEngine` by hand can drop both methods.
- `SyncEvent` gains `"error"`, sent when the engine records a failure, which
  `getStatus().failure` then holds. Work that throws, which used to send no event, now sends
  `"error"`, before `onError` runs or the error propagates. A write loop sends it after the
  `"remote"` of the apply that stopped it, and a failed wait for `ready` after `"disconnect"`. A
  `switch` over `SyncEvent` must handle it.
- `SyncEngine` drops `subscribeStatus()`: every change of the status comes with a sync event, so
  `subscribe` tells when to read it. Replace `engine.subscribeStatus(listener)` with
  `engine.subscribe(() => listener())`, and read `engine.getStatus()` in it as before; it returns
  the same object while the status is unchanged, so compare by identity to skip the events that
  change nothing. An object that implements `SyncEngine` by hand can drop the method.
- `SyncEngineConfig.seed` is a boolean, `true` by default, and the `SeedStrategy` type is gone.
  `"if-empty"` seeded each synced key the backend lacks, not only an empty backend. Replace
  `seed: "if-empty"` with `seed: true`, or leave it out, and `seed: "never"` with `seed: false`.
  This also applies to the options of Zustand's and Redux's `homeostate`, `syncMobxStore`,
  `syncStateTree` and `atomWithSync`. Remove imports of `SeedStrategy`; type a variable that holds
  the option as `boolean`. In plain JavaScript, a leftover `seed: "never"` is truthy and now
  seeds, so replace it.
