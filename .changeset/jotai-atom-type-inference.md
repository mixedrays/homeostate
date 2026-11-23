---
"@homeostate/store-jotai": patch
---

`createJotaiAdapter` now types the state of a single atom from the atom's value only. A
primitive atom's state is its value, so `createJotaiAdapter(atom<Counter>(...))` returns a
`StoreAdapter<Counter>` instead of a `StoreAdapter<SetStateAction<Counter>>`, and an
`atomWithReset` atom, whose write also takes `RESET`, now compiles. Read-only atoms, write-only
atoms and atoms whose write does not take their own value are still rejected.
