# @homeostate/store-mobx

## 0.3.0

### Minor Changes

- 12e1d73: **Breaking:** `createMobxAdapter` takes its synced keys as an option. `createMobxAdapter(store)`
  syncs every observable data field of the store and leaves computeds, actions and fields MobX
  does not observe local. `createMobxAdapter(store, { omit: ["draft"] })` keeps the named fields
  local, and `createMobxAdapter(store, { keys: ["todos", "filter"] })` replaces
  `createMobxAdapter(store, ["todos", "filter"])`, syncing the listed fields alone. Passing an
  array throws a `TypeError` naming the new form.

  `keys` and `omit` take readonly lists, such as an `as const` constant, and name only data
  fields of the store: a method name, a typo, or both options together are compile errors. The
  adapter's state is typed as the synced fields, `Pick<S, K>`, instead of the whole store, so it
  no longer claims the store's methods. The options type is exported as `MobxAdapterOptions`.

### Patch Changes

- 074eadc: Document how a failed backend write surfaces with MobX. The engine writes local changes from
  inside the adapter's reaction, which MobX's error boundary guards, so without the engine's new
  `onError` option the error is only logged by MobX and the action returns normally. With
  `onError`, the engine reports it there instead.
- Updated dependencies [39809d7]
- Updated dependencies [a80be3b]
- Updated dependencies [60331b4]
- Updated dependencies [567932b]
- Updated dependencies [55812ce]
- Updated dependencies [d2a66d8]
- Updated dependencies [8ed9541]
- Updated dependencies [ceca144]
- Updated dependencies [3bdd635]
- Updated dependencies [9a6e0c6]
- Updated dependencies [aa7cbc1]
- Updated dependencies [3b9d6dc]
- Updated dependencies [9ce5ff0]
- Updated dependencies [cde0b51]
- Updated dependencies [074eadc]
- Updated dependencies [7e7171a]
  - @homeostate/core@0.4.0

## 0.2.1

### Patch Changes

- Updated dependencies [732c2c8]
- Updated dependencies [f901667]
- Updated dependencies [d858951]
- Updated dependencies [f77d8a6]
- Updated dependencies [29f8f0d]
- Updated dependencies [456fbad]
- Updated dependencies [30e31df]
- Updated dependencies [314e268]
- Updated dependencies [4564712]
- Updated dependencies [d8e9906]
- Updated dependencies [008091c]
  - @homeostate/core@0.3.0

## 0.2.0

### Minor Changes

- 81d1d18: Stop exporting the adapter classes (`JotaiAdapter`, `MobxAdapter`, `MobxStateTreeAdapter`, `ReduxAdapter`, `TanStackStoreAdapter`, `ValtioAdapter`, `ZustandAdapter`); create adapters with the `create*Adapter` factories, which now carry the adapter docs and examples.

### Patch Changes

- ca368b0: Remove a synced key from the store when a remote peer deletes it. Before, the store and the
  adapter's snapshot kept the stale value, and the next local change wrote it back to every
  peer. A class field that `makeObservable` defined cannot be deleted, so it is set to
  `undefined`; the adapter now leaves synced keys whose value is `undefined` out of the synced
  state.
- 33c7b14: Mark the package side-effect free, so bundlers can drop modules that are not imported.
- Updated dependencies [a643bbe]
- Updated dependencies [0bbf653]
- Updated dependencies [fb76f77]
  - @homeostate/core@0.2.0

## 0.1.2

### Patch Changes

- 30abf27: Remove draft release warnings, update docs links
- Updated dependencies [30abf27]
  - @homeostate/core@0.1.2

## 0.1.1

### Patch Changes

- 8bd452e: Init release
- Updated dependencies [8bd452e]
  - @homeostate/core@0.1.1
