---
"@homeostate/crdt-automerge": patch
---

With an automerge-repo `DocHandle`, a listener of the backend that throws, such as the sync
engine's when the store adapter rejects remote state and the engine has no `onError`, no longer
stops the change from reaching the handle's later `"heads-changed"` listeners, its `"change"`
event and the `Repo`'s sync to peers. These missed the change until the next one, which then
reported both changes as one. The backend now adds one `"heads-changed"` listener to the handle,
which calls every listener subscribed to the backend and throws each error from a timer, as an
uncaught error, as automerge-repo did. The same applies to any handle passed as an
`AutomergeRepoHandle`.
