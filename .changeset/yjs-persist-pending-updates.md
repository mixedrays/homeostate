---
"@homeostate/crdt-yjs": patch
---

`createYjsPersistable` now stores an update that waits for an earlier one. Yjs's `update` event
carries only such an update's deletes, so storage kept the deletes without the values that
replace them, and a document restored during the wait lost those values and passed the deletes
on to its peers. A wait that spans several transactions is stored once.
