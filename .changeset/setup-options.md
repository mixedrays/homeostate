---
"@homeostate/core": minor
---

Export `SetupOptions`, the options every setup helper takes: the `backend`, the `connect`
mode, `"auto"` or `"manual"`, and the engine's `SyncEngineConfig`. A setup helper is the one
call in a store adapter package that creates the adapter and the engine for one store; the
Zustand `homeostate` middleware's options are `SetupOptions`.
