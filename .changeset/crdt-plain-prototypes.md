---
"@homeostate/crdt-yjs": patch
"@homeostate/crdt-loro": patch
---

Leave copying objects that a peer's `__proto__` entry gave a prototype to the sync engine, which
now does it for every backend. `read()` may return such an object as the document holds it; the
store still never receives one. The Yjs backend still leaves `__proto__` entries of a `Y.Map`
out of what it reads. Use it with the `@homeostate/core` release whose engine copies such objects.
