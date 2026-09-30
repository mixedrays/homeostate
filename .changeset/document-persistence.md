---
"@homeostate/core": minor
"@homeostate/crdt-yjs": minor
"@homeostate/crdt-loro": minor
"@homeostate/crdt-automerge": minor
"@homeostate/persist-indexeddb": minor
"@homeostate/persist-local-storage": minor
---

Add document persistence, so a synced document survives reloads, offline starts, and every peer and the sync server losing it. `createPersistence` in `@homeostate/core` keeps a CRDT document in a `PersistenceAdapter`; `createYjsPersistable`, `createLoroPersistable` and `createAutomergePersistable` expose each backend's document to it; and the new `@homeostate/persist-indexeddb` and `@homeostate/persist-local-storage` packages store it in IndexedDB or Web Storage. `createMemoryPersistenceAdapter` in `@homeostate/core/testing` is an in-memory adapter for tests.
