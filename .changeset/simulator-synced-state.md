---
"@homeostate/tool-simulator": patch
---

A peer's `syncedState()` reads the engine's `getSyncedState()` instead of applying the filter
again, so convergence compares exactly what the engine syncs.
