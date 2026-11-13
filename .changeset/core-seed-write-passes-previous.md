---
"@homeostate/core": patch
---

The write that seeds the keys a backend lacks on `connect()` now passes what the engine has just
read as `previous`. A backend built with `createCrdtBackend` no longer reads its document a
second time for that write, and diffs it against a `previous` that shares every object with
`next` but the seeded keys. With the Yjs backend and 5,000 todos, a seeding `connect()` takes
2.4 ms instead of 4.0 ms.
