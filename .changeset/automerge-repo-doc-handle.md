---
"@homeostate/crdt-automerge": minor
---

Sync a document kept by automerge-repo. `createAutomergeBackend` now takes a `DocHandle` as
well as an `AutomergeHandle`, so a `Repo`'s storage and network adapters store and sync what the
engine writes:

```ts
createAutomergeBackend(await repo.find(url), "shared");
```

The engine picks up every change that did not come through its own write: changes loaded from
storage, received from peers, or made through `docHandle.change`. Either handle may now hold any
document type, such as the `unknown` of an untyped `repo.find` or an interface.
