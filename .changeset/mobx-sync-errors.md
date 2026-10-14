---
"@homeostate/store-mobx": patch
---

Document how a failed backend write surfaces with MobX. The engine writes local changes from
inside the adapter's reaction, which MobX's error boundary guards, so without the engine's new
`onError` option the error is only logged by MobX and the action returns normally. With
`onError`, the engine reports it there instead.
