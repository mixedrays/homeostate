---
"@homeostate/crdt-automerge": patch
---

Throw from `createAutomergePersistable`'s `apply` for bytes that are not Automerge data. Once a
document held changes, `A.loadIncremental` skipped such bytes silently, so `createPersistence`
took a log holding damaged bytes or another CRDT library's update for one it had restored in
full, and compacted them away. A repeated update, or one waiting for an earlier change, still
applies without an error.
