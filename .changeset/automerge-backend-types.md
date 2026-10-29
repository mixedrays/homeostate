---
"@homeostate/crdt-automerge": patch
---

Implement the `CrdtBackend` whose `read` returns a `JsonObject` and whose `write` takes a
`JsonObjectInput`. `read()` throws a `TypeError` naming what the synced key holds when a peer
stored something other than a map there, such as a string, a list or `null`, instead of
returning it, or `{}` for `null`. The sync engine reports it as before, and `write` still
replaces the value with a map. Use it with the `@homeostate/core` release that narrows
`CrdtBackend.read` and `write`.
