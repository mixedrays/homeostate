---
"@homeostate/crdt-yjs": patch
"@homeostate/crdt-loro": patch
---

Implement the `CrdtBackend` whose `read` returns a `JsonObject` and whose `write` takes a
`JsonObjectInput`, with no casts at the boundary. Use it with the `@homeostate/core` release
that narrows `CrdtBackend.read` and `write`.
