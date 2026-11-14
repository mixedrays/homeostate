---
"@homeostate/crdt-yjs": patch
---

A change elsewhere in the document no longer makes the next store change read the whole synced
map. The backend's `revision` counted every transaction in the document, so another backend's
write or an editor's keystroke in a `Y.Text` made the engine read the map and compare it with
what it last synced. It now counts only the transactions that change the synced map or a type
inside it. With 5,000 todos, a toggle that follows an insert into another shared type takes
about 0.07 ms instead of 1.5 ms, and with two backends on one document writing in turn, each
toggle takes about 0.07 ms instead of 1.1 to 1.2 ms, with no read of the map.
