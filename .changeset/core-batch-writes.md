---
"@homeostate/core": minor
---

`StoreAdapter` gains an optional `batchWrites` flag, for a store that notifies once per
property set, such as a Valtio proxy, on which one `splice`, `unshift`, `shift`, `sort` or
`reverse` notifies once per item it shifts. Written one by one, those intermediate states made
every shifted item look replaced, so a peer's concurrent insert duplicated items and its
concurrent edits landed on the wrong item or were lost.

With the flag, the sync engine writes local changes once per microtask: the first notification
queues one write of the store's synced state as it is when the write runs, with one `"local"`
event. The adapter still notifies synchronously, so echoes of `setState` write nothing. A remote
change applied while the write waits is merged with the waiting local change, as a local change
is merged into a pending apply, and the merged state is written at once. `disconnect()` writes a
waiting local change before it unsubscribes, sending its event first, and still disconnects if
that write throws. A queued write that throws goes to `onError`, and without it is thrown from
the microtask as an uncaught error. `scopeAdapter` keeps the flag, and an adapter that wraps one
with it must keep it too. Adapters without it are written synchronously, as before.
