---
"@homeostate/core": minor
---

`scopeAdapter` turns a store adapter into one for a slice of the store, so that the sync engine
treats the slice as the store's whole state. It syncs a nested slice, which `keys` and `omit`
cannot reach, or several slices of one store to several rooms, with one engine and one backend
each. It takes `get` and `set`, typed by `AdapterScope<S, T>`. A store change reaches the engine
only when the slice differs as JSON, so a change elsewhere in the store causes no `backend.write`,
also with adapters that return fresh copies, such as MobX's, and with a `get` that builds a new
object.
