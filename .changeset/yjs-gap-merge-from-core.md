---
"@homeostate/crdt-yjs": patch
---

While an update waits for an earlier one, writes now merge with core's `mergeConcurrent`, with
the backend's `text` option, instead of a merge of their own. Two cases change:

- Object entries holding `undefined` or a function count as absent, and such array items as
  `null`, as the document stores them. Before, a value an earlier write in the gap left as
  `undefined` or a function counted as present, so the state `read()` showed could keep an edit
  the document had dropped, or drop one the document kept.
- A value the store holds equal to the document's is left as it is, so an item the store and a
  peer both inserted at one place is written once where the two arrays are otherwise equal,
  instead of twice.
