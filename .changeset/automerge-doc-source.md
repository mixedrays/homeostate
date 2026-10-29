---
"@homeostate/crdt-automerge": minor
---

`createAutomergeBackend` accepts any object with `doc`, `change` and `subscribe`, exported as
`AutomergeDocSource`, so a document holder of your own no longer needs an `update` the backend
never calls.
