---
"@homeostate/store-mobx": patch
---

Remove a synced key from the store when a remote peer deletes it. Before, the store and the
adapter's snapshot kept the stale value, and the next local change wrote it back to every
peer. A class field that `makeObservable` defined cannot be deleted, so it is set to
`undefined`; the adapter now leaves synced keys whose value is `undefined` out of the synced
state.
