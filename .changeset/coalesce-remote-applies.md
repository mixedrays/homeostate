---
"@homeostate/core": patch
---

`SyncEngineConfig` takes an optional `schedule`, which coalesces remote changes. The first
remote change hands it a `flush`, such as `(flush) => queueMicrotask(flush)`, and every remote
change before that call is applied to the store with one backend read and one `setState`,
instead of one each. A local change made while an apply is pending runs it first, and the
remote changes win: what the local change did to synced keys is lost. `disconnect()` runs a
pending apply. Without `schedule`, remote changes are applied synchronously as before.
