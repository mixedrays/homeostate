---
"@homeostate/core": minor
---

Add `compact()` and `stats()` to the handle `createPersistence` returns. `compact()` merges the
stored log into one snapshot now, as every `compactAfter` appends do. `stats()` resolves with
the number of stored updates and their size in bytes, once pending writes finish.
