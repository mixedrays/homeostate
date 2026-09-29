---
"@homeostate/core": minor
---

Move `createMemoryBackend` and `MemoryBackend` to the `@homeostate/core/testing` entry, so the root entry only exports what production code uses. Mark the package side-effect free.
