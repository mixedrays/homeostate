---
"@homeostate/store-zustand": patch
---

`store.homeostate` now exposes every member of the sync engine, including `isReady()`, and the
docs describe core's `ready` option, which the middleware takes with the rest of the engine's
config. With `persist`, the store writes once hydration and `ready` have both finished.
