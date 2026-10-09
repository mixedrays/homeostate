---
"@homeostate/tool-simulator": minor
---

Add `@homeostate/tool-simulator`, to test that peers converge. `createNetwork` runs peers, each a store, a backend and a sync engine, on a simulated network on virtual time, with latency, dropped and reordered messages, cut links and partitions, and carries each backend's document as binary updates. `expectConverged()` checks that every peer's store and document agree and says where they differ. `runRandomized` drives random edits and link changes across a fresh network and names the seed of a run that does not converge, so it can be replayed.
