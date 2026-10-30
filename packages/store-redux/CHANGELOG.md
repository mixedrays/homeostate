# @homeostate/store-redux

## 0.3.0

### Minor Changes

- 2d817ab: Accept any store with Redux's interface, and drop the `redux` peer dependency.
  `createReduxAdapter` now takes a `ReduxLikeStore`, a store with `getState`, `dispatch` and
  `subscribe`, instead of Redux 5's `Store` type, so Redux 4 stores and stores made with
  Zustand's `redux` middleware type-check next to Redux 5 and Redux Toolkit stores. The
  published types no longer import `redux`, so a Redux Toolkit app installs no extra package,
  and a new Redux major needs no release of this package. The replace action creator only has
  to return an action with a `type`; the state may travel under any property, not just
  `payload`. The type is exported as `ReduxLikeStore`.
- 48d6962: Sync a store of several slices with no replace case of its own. The new `withHomeostate`
  wraps any root reducer, such as `combineReducers({ todos, ui })`, so that it answers the new
  `replaceState` action by returning its payload as the new root state, and
  `createReduxAdapter(store)` now dispatches `replaceState` when no `setStateAction` is passed:

  ```ts
  const store = configureStore({
    reducer: withHomeostate(combineReducers({ todos, ui })),
  });
  const adapter = createReduxAdapter(store);
  ```

  Before, the replace case had to be a slice reducer, which only replaced the root when that
  slice was the root reducer. `replaceState` has a `type` and a `match` type guard, so a slice
  can also handle it with `builder.addCase(replaceState<State>, ...)`. Its type, `REPLACE_STATE`
  (`"@homeostate/replaceState"`), can be passed to Redux DevTools' `actionsDenylist` and to
  Redux Toolkit's `serializableCheck.ignoredActions`; the action type is exported as
  `ReplaceStateAction`. Passing a `setStateAction` of your own works as before.

### Patch Changes

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
