---
"@homeostate/crdt-yjs": patch
---

The Undo and redo section of the introduction now warns that, with garbage collection on, the
`Y.Doc` default, Yjs 13.6.0 to 13.6.33 can throw a `TypeError` in `Y.UndoManager`'s `undo()` or
`redo()`, or in another peer's `Y.applyUpdate`, once peers edit concurrently and one of them
undoes. It shows `new Y.Doc({ gc: false })` on every replica as the workaround, and its cost:
deleted content is never freed, so the document and its updates keep growing.
