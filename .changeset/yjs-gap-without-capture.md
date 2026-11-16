---
"@homeostate/crdt-yjs": patch
---

A backend no longer reads the whole synced map before each remote transaction to keep a copy
for an update that waits for an earlier one. While such an update waits, it shows what the map
held when the engine last read or wrote it. With the engine's `schedule`, that is the state at
its last flush or write, so remote changes waiting for the flush reach the store once the
earlier update arrives, not before. With 5,000 todos and `schedule`, ten remote transactions
before one flush now read the map once, in the flush, instead of 11 times; without `schedule`,
the first remote transaction after `connect()` reads it once instead of twice.
