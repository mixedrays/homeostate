---
"@homeostate/tool-simulator": minor
---

`advance` and `settle` now check, after every delivery, that no peer's store and document both lose a synced top-level key that no peer deleted, and reject with a `LostKeyError` naming the peer, the key, the virtual time and the seed. `runRandomized` runs the check too, so its error names the step in which a key was lost. Before, a store that dropped a key for a while and got it back once a late update arrived still converged, so the run passed. Runs that passed before can now fail. A key deleted during a delivery, such as by a store subscriber or a timer, is reported as lost: pass `checkLostKeys: false` to `createNetwork`, or in `runRandomized`'s `network`, to turn the check off.
