---
"@homeostate/store-mobx": minor
---

**Breaking:** `createMobxAdapter` takes its synced keys as an option. `createMobxAdapter(store)`
syncs every observable data field of the store and leaves computeds, actions and fields MobX
does not observe local. `createMobxAdapter(store, { omit: ["draft"] })` keeps the named fields
local, and `createMobxAdapter(store, { keys: ["todos", "filter"] })` replaces
`createMobxAdapter(store, ["todos", "filter"])`, syncing the listed fields alone. Passing an
array throws a `TypeError` naming the new form.

`keys` and `omit` take readonly lists, such as an `as const` constant, and name only data
fields of the store: a method name, a typo, or both options together are compile errors. The
adapter's state is typed as the synced fields, `Pick<S, K>`, instead of the whole store, so it
no longer claims the store's methods. The options type is exported as `MobxAdapterOptions`.
