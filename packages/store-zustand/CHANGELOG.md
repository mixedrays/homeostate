# @homeostate/store-zustand

## 0.3.0

### Minor Changes

- 3b9d6dc: **Breaking:** the `homeostate` middleware takes the state creator first and its options
  second, as Zustand's own middlewares do. `homeostate(creator, { backend, ...config })`
  replaces `homeostate(backend, creator, config)`: move the backend into the options, next to
  `filter`, `seed`, `schedule` and `onError`. With `persist`, write
  `homeostate(persist(creator, options), { backend })`. Calling the middleware with the backend
  first throws a `TypeError` naming the new order. The options type is exported as
  `HomeostateOptions`.

  `connect: "manual"` creates the store without reading or writing the backend and leaves
  `store.homeostate.connect()` to the app, for example once its provider has received the
  room's state or its document persistence has loaded. A `store.homeostate.connect()` made
  before `persist` has hydrated the store waits for the hydration, with either connect mode,
  instead of connecting at once.

- fbc31b4: The `homeostate` middleware works with Zustand's `persist` placed inside it,
  `homeostate(persist(creator, options), { backend })`, including with asynchronous storage. The
  store connects once `persist` has hydrated it, so a room with state wins over the persisted
  state instead of being overwritten by it, and persisted state still seeds an empty room. Until
  then `store.homeostate.isConnected()` is `false`, and `disconnect()` cancels the pending
  connect. With `persist` outside the middleware, which overwrote the persisted state
  with the creator's, creating the store now throws an error naming the right order.
- 7e7171a: The `homeostate` middleware takes the engine's new `keys` and `omit` options, checked against the
  store's state: `homeostate(creator, { backend, omit: ["draft"] })` keeps a key local, and a
  misspelled key fails to compile. `HomeostateOptions` is generic, `HomeostateOptions<T>`, and
  types `filter` by the state too.

### Patch Changes

- cde0b51: `store.homeostate` forwards the engine's new `subscribe` and `getSyncedState`.
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

- 379ef4a: Fix the JSDoc examples shown in editor tooltips. The `homeostate` example now uses the curried
  `create<T>()(...)` form, since `create(homeostate(...))` types the state as `object`, and the
  `createZustandAdapter` example lists its imports.
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
