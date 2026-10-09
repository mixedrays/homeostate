---
"@homeostate/core": patch
---

Tell a hole from a value in nested arrays. `getChanges` skipped the holes of a sparse array
inside an array item, so it found no change when a remote state held a value there, and the
store kept the hole.
