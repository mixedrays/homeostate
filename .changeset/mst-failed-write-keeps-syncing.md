---
"@homeostate/store-mobx-state-tree": patch
---

Keep syncing after a backend write fails without the engine's `onError`. The error escaped into
MST's snapshot reaction, which rethrows it and so left MobX mid-batch: the node's later changes
never reached the room, and every other MobX reaction in the app stopped too, other engines and
`observer` components included. The adapter now catches the error and logs it with
`console.error`, as MobX does for its own reactions, so the action that changed the node returns
normally instead of throwing it, and `getStatus()` keeps it until the next write succeeds.
