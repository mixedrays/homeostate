---
"@homeostate/core": minor
---

Apply a remote change the backend holds before writing a local change, even when the engine has
not heard of it yet. A listener subscribed to the document before `connect()` that changed the
store as it heard of a peer's change made the engine write over that change, diffing against a
`previous` the document no longer held: the Yjs and Loro backends threw, so the store's change
was reported as a backend error and dropped, and the Automerge backend brought back what the
peer had deleted. The remote change now wins, as it does over a local change made while a
scheduled apply is pending: what the local change did to synced keys is lost.

`CrdtBackend` takes an optional `revision()`: a value equal to an earlier one only if the synced
subtree has not changed since, whether or not `subscribe` has reported the change, and
`undefined` while the backend cannot tell. Before writing a local change, the engine reads the
backend unless the revision is the one it recorded when it last synced, and applies what it
finds first if that differs from what it last synced. A backend without `revision` is read
before every local change, so a custom backend pays one read per write until it implements
one. `createMemoryBackend` counts its writes and receives.

A local change made while a scheduled apply is pending is no longer lost when the engine has
already applied those remote changes, and the write that follows `setState` passes no
`previous` when the backend changed during it.
