---
"@homeostate/core": minor
---

Add `subscribe` and `getSyncedState` to `SyncEngine`. `engine.subscribe(listener)` calls the
listener after every sync event, a `SyncEvent`: `"local"` once a local change is written,
`"remote"` once a remote change is applied (once per flush with `schedule`, and for a local
change that first runs a pending apply), and `"connect"` and `"disconnect"` once
`isConnected()` has changed. Events are sent synchronously and not at all when the work throws;
a listener that throws is logged with `console.error` without stopping the other listeners or
the store's subscribers. `engine.getSyncedState()` returns the store's synced keys with the
store's own values, connected or not, so tools no longer rebuild the engine's filter.
