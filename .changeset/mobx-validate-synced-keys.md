---
"@homeostate/store-mobx": patch
---

`createMobxAdapter` and `syncMobxStore` now check the fields `keys` lists when they are called,
and throw a `TypeError` naming a key that cannot sync: a computed, an action or other function, a
field MobX does not observe, or a key a class store does not have. A computed listed in `keys` was
read into the synced state and written to the backend, and every peer listing it then threw on
a remote change that carried a new value for it, after the fields before it were already applied.
A field MobX does not observe was synced when connecting, but its later changes were not. Fields
annotated `observable`, `observableRef`, `observableShallow` or `observableStruct`
(`observable.ref` and so on in MobX 6), a declared field that is `undefined`, and the data
properties of an `observable({...})` object, including one the object gains later, are accepted.
`omit` is not checked.
