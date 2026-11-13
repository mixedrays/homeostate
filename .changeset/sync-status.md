---
"@homeostate/core": minor
---

Read what the sync engine is doing. `getStatus()` returns `{ connected, ready, failure }`, and
every change of it comes with a sync event, so `subscribe` tells when to read it again:

```ts
engine.subscribe(() => {
  const { ready, failure } = engine.getStatus();
  saveButton.disabled = !ready;
  if (failure) report(failure.error, failure.source);
});
```

`connected` says whether the engine is subscribed, and `ready` whether local changes are written.
Neither says anything about the network: `connected` stays `true` while the sync server is down,
and without the `ready` option `ready` equals `connected`. `failure` holds what went wrong and its source until the engine
recovers: the next completed write, apply or connect clears it, and `disconnect()` keeps it. A
`WriteLoopError` shows in every build, with or without `onError`. The status is a frozen object, the
same one until a field changes.

A failure also sends the new `"error"` sync event; see the migration notes. `onError` and what
propagates are unchanged. An object that implements `SyncEngine` by hand must add `getStatus`.
