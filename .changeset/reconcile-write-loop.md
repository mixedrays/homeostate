---
"@homeostate/core": patch
---

Stop peers from re-writing each other's changes forever. Since the engine writes what a store
changes while a remote change is applied, peers whose stores change that state again on every
apply, such as a replace reducer that stamps `updatedAt` or two app versions that normalise a
key in contradicting ways, kept writing to each other, growing the document's history without
bound. Once another peer changes the keys the engine's last write back changed and the store
changes them again, the engine now applies the remote change without writing those keys back,
and warns once in development naming them. The store keeps its values for those keys, which
differ from the backend's. A key the store changes anew, such as one it derives from an edit,
is still written back after every remote change.
