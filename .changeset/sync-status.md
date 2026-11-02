---
"@homeostate/core": minor
---

Read what the sync engine is doing. `getStatus()` returns `{ connected, ready, failure }`, and
`subscribeStatus(listener)` calls back when it changes:

```ts
engine.subscribeStatus(() => {
  const { ready, failure } = engine.getStatus();
  saveButton.disabled = !ready;
  if (failure) report(failure.error, failure.source);
});
```

`connected` and `ready` are what `isConnected()` and `isReady()` return, and say nothing about the
network: `connected` stays `true` while the sync server is down, and without the `ready` option
`ready` equals `connected`. `failure` holds what went wrong and its source until the engine
recovers: the next completed write, apply or connect clears it, and `disconnect()` keeps it. A
`WriteLoopError` shows in every build, with or without `onError`. The status is a frozen object, the
same one until a field changes.

`onError`, the sync events and what propagates are unchanged. An object that implements
`SyncEngine` by hand must add `getStatus` and `subscribeStatus`.
