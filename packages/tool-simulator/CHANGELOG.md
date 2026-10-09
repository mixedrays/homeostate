# @homeostate/tool-simulator

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
