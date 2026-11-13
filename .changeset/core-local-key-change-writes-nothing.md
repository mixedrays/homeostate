---
"@homeostate/core": patch
---

A store change that leaves every synced key as it was, such as a change to a draft or a UI flag
under `omit`, no longer calls `backend.write`. The engine skips the write when every synced
value is still the object or value it last wrote or read, and still sends `'local'`. With the
Yjs backend, such a change used to run an empty transaction, which also moved the backend's
`revision`; it now runs none.
