---
"@homeostate/core": patch
---

`mergeConcurrent`, and so the sync engine's merge of a local change into a pending apply, now
matches list records by a unique value, such as an `id`. Until now, it matched only items equal
on both sides and paired the rest by position, so where the remote change inserted or deleted
items and also changed the item the store edited, the local edit landed on a neighbouring item,
or was lost, in the store and the backend.

Now, inside each run of items left unmatched, a base record and a side record are paired first
when they share a string, number or boolean entry that no other record of either array holds,
such as `id: "r1"`. A value several records hold, such as `done: false`, pairs none, so a record
still matches itself where the other side changed another of its entries.
Records with duplicated or changed ids, items that are not records, and pairs that would cross
others still pair by position. `getChanges` is unchanged.
