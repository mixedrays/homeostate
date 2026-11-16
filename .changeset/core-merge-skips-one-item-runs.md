---
"@homeostate/core": patch
---

`mergeConcurrent` merges arrays faster, with the same results. A run of one changed item on
each side, such as a list item edited in place, no longer makes the merge index the primitive
entries of both whole arrays, since matching by a unique value could only pair those two items
again. Where a run does need the index, the base array's is built once for both sides, and
each record's entries are read once. With 20,000 todos and each side toggling one, a merge
takes about 9 ms instead of 42 ms.
