---
"@homeostate/store-zustand": patch
---

The `homeostate` middleware works with Zustand's `persist` placed inside it,
`homeostate(backend, persist(creator, options))`, including with asynchronous storage. The
store connects once `persist` has hydrated it, so a room with state wins over the persisted
state instead of being overwritten by it, and persisted state still seeds an empty room. Until
then `store.homeostate.isConnected()` is `false`, and `connect()` or `disconnect()` cancels
the pending connect. With `persist` outside the middleware, which overwrote the persisted state
with the creator's, creating the store now throws an error naming the right order.
