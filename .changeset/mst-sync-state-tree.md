---
"@homeostate/store-mobx-state-tree": minor
---

Set up sync with one call, tied to the node's lifetime.
`syncStateTree(node, { backend, ...options })` creates the store adapter and the sync engine,
connects before it returns, and returns the engine:

```ts
const engine = syncStateTree(todoStore, { backend, omit: ["searchTerm"] });

engine.disconnect();
```

The options are the ones every setup helper takes: the `backend`, the `connect` mode and the sync
engine's config (`filter`, `keys`, `omit`, `seed`, `schedule`, `onError`), with key names checked
against the node's snapshot. With `connect: "manual"`, nothing reads or writes the node's state or
the backend until the app calls `engine.connect()`. The options type is exported as
`SyncStateTreeOptions`.

Destroying the node disconnects the engine through `addDisposer`, including when an ancestor is
destroyed, so a later remote change does not touch it. A remote change still waiting for `schedule`
is not applied to the dying node and stays in the room. `connect()` on a destroyed node throws
before it touches the node or the backend, and so does the helper unless `connect` is `"manual"`.
