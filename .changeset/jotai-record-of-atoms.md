---
"@homeostate/store-jotai": minor
---

`createJotaiAdapter` also takes a record of writable atoms, one per synced key, and syncs them as
one state typed from the atoms, without a hand-written root atom. A remote change sets every atom
it changes in one `store.set`, so subscribers hear one notification, and leaves the other atoms
untouched. When a peer removes a key, its atom is reset to its initial value, which is written
back, instead of holding `undefined`; an atom without an initial value keeps its own. The
single-atom form is unchanged. `SyncedAtoms<R>` and `SyncedAtomsState<R>` are exported to name
the record and its state.
