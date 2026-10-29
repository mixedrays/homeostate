---
"@homeostate/core": minor
---

Add the `onError` option to `createSyncEngine`, to handle what the store adapter or the backend
throws once the engine is connected. Without it, a store validation error in `setState` reached
the provider's message handler and a failed `write` reached the code that changed the store,
while the engine stayed connected and nothing recorded that the two sides differed. With
`onError`, the engine catches those errors, from notifications, the scheduled flush and
`disconnect()`, and calls `onError(error, source)`, where `source` is `"store"` or `"backend"`.
Without it, errors propagate as before, and `connect()` always throws.

A `read()` or `getState()` that does not return an object now throws a `TypeError` naming the
method and what it returned, such as `CrdtBackend.read() must return a plain object, got
string`, from `connect()` or through `onError`. Before, such a backend was treated as empty and
overwritten by the seed, a backend that came to hold no object cleared the store's synced keys,
and an adapter returning `undefined` failed with `Cannot convert undefined or null to object`.

A stopped write loop is reported to `onError` as a `WriteLoopError`, with the source `"store"`
and the keys in `keys`, once per set of keys and in every build. Without `onError`, the engine
still warns once in development.
