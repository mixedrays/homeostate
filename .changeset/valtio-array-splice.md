---
"@homeostate/store-valtio": patch
---

Apply a remote removal, insertion or move as an array splice. The adapter compared arrays by
index, so removing the first of 1000 todos rewrote every later proxy with its successor's data
and gave every row a new snapshot; the rows around a change now keep their snapshots.
