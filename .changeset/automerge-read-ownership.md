---
"@homeostate/crdt-automerge": patch
---

Changing a `read()` result no longer changes later reads or what a write diffs against. Until
now, the backend returned its cached snapshot, so pushing to an array from `read()` made the next
`read()` report it while the document did not hold it, and a `write` without `previous` diffed
against the changed copy, which could leave the document unequal to what was written. The backend
now keeps a copy of its own, and each read returns the objects the last read returned only while
they still match it, so unchanged subtrees keep their identity between reads. That check visits
the whole synced state on every read, about 0.07 ms at 1000 todos and 0.4 ms at 5000, so a
remote change reaches the store that much later.
