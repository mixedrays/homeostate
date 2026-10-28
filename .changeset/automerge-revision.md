---
"@homeostate/crdt-automerge": minor
---

Implement `CrdtBackend.revision` from the document's heads. The sync engine then applies a remote
change another listener heard of first before writing a local change, instead of the write
bringing back what the peer had deleted.
