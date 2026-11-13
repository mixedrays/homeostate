---
"@homeostate/core": minor
---

Wait before writing. The new `ready` option of `SyncEngineConfig` holds back every write to the
backend until it resolves, so a peer joining a populated room adopts it instead of competing
with it, whichever CRDT library and provider it uses:

```ts
const engine = createSyncEngine({
  backend,
  adapter,
  ready: () => Promise.all([persistence.whenLoaded, synced(provider)]),
});
engine.connect();
```

`ready` is a promise, or a function returning one that every `connect()` calls. `connect()` adopts
what the backend holds and subscribes to both sides. While waiting, remote changes are applied
per key and nothing is written: no seed, no local change, and nothing the store changes during an
apply. Once it resolves, the engine reconciles as `connect()` does. Local changes made meanwhile
are provisional: a key the backend holds keeps its value, and a key it lacks is written, also with
`seed: false`.

A rejected `ready`, or a failure while reconciling after it, disconnects the engine, sends
`"disconnect"`, and reports to `onError`, with the new source `"ready"` for a rejection. Without
`onError`, it surfaces as an unhandled rejection. A `ready` that never settles keeps the engine
waiting until `disconnect()`. The engine has no timer: to start offline, race `ready` against a
timeout, which trades safety for that start.

`SyncEvent` gains the `"ready"` event, sent only with the option. `getStatus().ready` is false
while disconnected and, with the option, until reconciliation is done; without it, it equals
`getStatus().connected`, which is true while waiting.

Without `ready`, the engine behaves as before.
