---
"@homeostate/tool-simulator": minor
---

`PeerSetup.config` is typed by the adapter's state, `SyncEngineConfig<S>`, so a peer can take the
engine's `keys` and `omit` with checked key names. Like `filter`, they also decide what
convergence compares.
