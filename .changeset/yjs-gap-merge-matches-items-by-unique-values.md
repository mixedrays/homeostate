---
"@homeostate/crdt-yjs": patch
---

While an update waits for an earlier one, the store's change to a list item now lands on that
item when peers inserted or deleted items beside it and also changed it. Until now, the write
paired that item with its neighbour, so the change was written into another item, or dropped,
for every peer, while the store showed it kept until the gap closed. The write's merge, core's
`mergeConcurrent`, now matches list records by a value no other record of either array holds,
such as an `id`, before their positions.
