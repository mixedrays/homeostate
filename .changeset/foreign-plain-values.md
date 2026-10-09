---
"@homeostate/crdt-yjs": patch
"@homeostate/crdt-loro": patch
---

Replace a plain array or object that other code stored in the synced map on the next write that
changes it. Writing over a plain array threw, leaving earlier changes of the write applied on
Yjs, and changes to a plain object were dropped, so the store and the document disagreed.
