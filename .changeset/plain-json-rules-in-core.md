---
"@homeostate/core": minor
---

The sync engine now guarantees that the store holds plain objects. Before it puts a remote value
into the store, it copies every object whose prototype is neither `Object.prototype` nor `null`
into a plain object of its own entries, at any depth, as it already left out `__proto__` keys.
A `CrdtBackend` whose library builds objects by assignment, so that a peer's `__proto__` entry
becomes a prototype, no longer has to undo that in `read()`; the `CrdtBackend.read` contract now
says so.

Export `jsonEqual(a, b)`, the equality the engine uses: whether two values are equal as
`JSON.stringify` would store them, comparing own keys only and ignoring `__proto__`. Export
`keepIdentity(previous, next)`, which returns `next` reusing every subtree of `previous` it leaves
unchanged, as the engine builds the store's next state, so an item that shifts in a list keeps
its identity.
