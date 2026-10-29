---
"@homeostate/core": minor
---

`SyncEngineConfig` takes `keys` or `omit`, lists of top-level keys to sync or to keep local, so
`createSyncEngine(backend, adapter, { omit: ["draft"] })` replaces a `filter` that restates the
default. They apply in both directions and on connect, on top of `filter`: a key is synced when
`filter` keeps it and, by name, `keys` lists it or `omit` does not name it. A key the backend
holds that `keys` does not list is ignored. Both accept readonly lists, such as `as const`
constants.

Breaking: `SyncEngineConfig` and `SetupOptions` are generic over the store's state,
`SyncEngineConfig<S>` and `SetupOptions<S>`, and `createSyncEngine` takes `S` from the adapter.
`keys` and `omit` accept only the state's key names, so a typo fails to compile, and giving both
is a type error. `filter` is typed `(key: keyof S & string, value: S[keyof S]) => boolean`.
Without `S`, the types are as before: keys are strings and values `unknown`.

To migrate:

- A filter that compares its `key` with a name the state's type does not declare, such as a key
  only the backend holds, fails to compile; annotate the parameter, `(key: string) => ...`.
- A config declared as a bare `SyncEngineConfig` and passed to an engine for a typed adapter
  fails to compile; declare it as `SyncEngineConfig<State>`.
- Both are type aliases now rather than interfaces, so an `interface` can no longer extend
  them; use an intersection type, such as `SetupOptions<State> & MyOptions`.
