# @homeostate/tool-simulator

## 0.2.0

### Minor Changes

- 7e7171a: `PeerSetup.config` is typed by the adapter's state, `SyncEngineConfig<S>`, so a peer can take the
  engine's `keys` and `omit` with checked key names. Like `filter`, they also decide what
  convergence compares.

### Patch Changes

- cde0b51: A peer's `syncedState()` reads the engine's `getSyncedState()` instead of applying the filter
  again, so convergence compares exactly what the engine syncs.
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

## 0.1.0

### Minor Changes

- 4483caf: Add `@homeostate/tool-simulator`, to test that peers converge. `createNetwork` runs peers, each a store, a backend and a sync engine, on a simulated network on virtual time, with latency, dropped and reordered messages, cut links and partitions, and carries each backend's document as binary updates. `expectConverged()` checks that every peer's store and document agree and says where they differ. `runRandomized` drives random edits and link changes across a fresh network and names the seed of a run that does not converge, so it can be replayed.

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
