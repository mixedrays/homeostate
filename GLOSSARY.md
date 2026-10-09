# Homeostate Glossary

The shared vocabulary of Homeostate: the sync engine that keeps any state manager in sync with any CRDT, its persistence, and the tools for inspecting and testing it. Code comments, docs, changesets and reviews in this repository use these terms.

## Architecture

**State manager**:
A library that holds application state, such as Zustand, Redux, MobX, Jotai or Valtio.
_Avoid_: State library, store library

**Store**:
One instance of a state manager's state that an app reads and updates, such as a Zustand store, a Valtio proxy or a Jotai atom.
In this repository, "store" never means a document or browser storage.
_Avoid_: State container, model

**CRDT**:
A conflict-free replicated data type: a data structure whose copies accept concurrent edits and merge them into the same result.

**CRDT library**:
A library that implements CRDTs and their documents: Yjs, Loro or Automerge.

**Document**:
One peer's copy of the data a CRDT library replicates, such as a `Y.Doc`, a `LoroDoc` or the Automerge document behind a handle.
_Avoid_: Doc (in prose), CRDT state

**Synced subtree**:
The part of a document that a CRDT backend reads and writes: the map or key named by the backend's `name` argument, such as `doc.getMap("shared")`.
_Avoid_: Synced map, shared map, root map

**Sync engine**:
The object from `createSyncEngine` that keeps the synced state of one store equal to the synced subtree of one document, in both directions.
_Avoid_: Syncer, binding

**Contract**:
One of the interfaces in `packages/core/src/types.ts` that packages implement: `StoreAdapter`, `CrdtBackend`, `PersistableDoc` or `PersistenceAdapter`.
_Avoid_: Protocol, spec

**Store adapter**:
An implementation of the `StoreAdapter` contract that lets the sync engine read, replace and watch one store; each `store-*` package provides one.
"Adapter" alone means a store adapter; say "persistence adapter" for storage.
_Avoid_: Store binding, connector

**CRDT backend**:
An implementation of the `CrdtBackend` contract that exposes a synced subtree as plain JSON through `read`, `write` and `subscribe`; each `crdt-*` package provides one.
A backend never talks to the network; replication is the provider's job.
_Avoid_: CRDT adapter, "backend" for a server

**Provider**:
The CRDT library's network layer that replicates a document between peers, such as y-websocket's `WebsocketProvider`. Homeostate never replicates documents itself.
_Avoid_: Transport, connection

**Sync server**:
A server, such as the y-websocket server, that relays updates between the peers of a room and keeps the room's document in memory.
_Avoid_: Backend

**Peer**:
One participant in a room: a store, its sync engine and CRDT backend, and their document. Each browser tab running the app is a peer.
_Avoid_: Client, node, user

**Room**:
The set of peers whose documents a provider keeps in sync, identified by a room name.
_Avoid_: Channel, session

## State

**Plain JSON**:
Values made only of objects, arrays, strings, finite numbers, booleans and `null`; the only values synced state may hold.
`Date`, `Map`, `Set` and class instances are neither diffed nor synced. `undefined` and nested functions are stored as `JSON.stringify` stores them.
_Avoid_: Serializable state, POJO

**Synced state**:
The plain JSON object the sync engine exchanges with a CRDT backend: the store's state reduced to its synced keys.
_Avoid_: Filtered state, shared state

**JSON snapshot**:
The plain JSON copy of a synced subtree that `CrdtBackend.read()` returns, which never aliases the backend's internals.
"Snapshot" alone is ambiguous here: say "JSON snapshot" or "compacted snapshot". MobX-State-Tree and Valtio snapshots belong to those libraries.
_Avoid_: State dump

**Filter**:
The `filter(key, value)` function in `SyncEngineConfig` that decides, per top-level key and in both directions, which keys are synced keys. `defaultSyncFilter` excludes functions.
_Avoid_: Sync filter, allowlist, selector

**Synced key**:
A top-level store key the filter lets through, so the sync engine reads it from and writes it to the CRDT backend.

**Local key**:
A top-level store key the filter keeps out of sync, such as an action or a draft, so it stays on one peer.
A local key is unrelated to a local change; the devtools mark local keys `local`.
_Avoid_: Private key, unsynced key

**Identity**:
Whether a value is the same object reference as before. The sync engine and store adapters keep the identity of unchanged subtrees, so components reading them do not re-render.
_Avoid_: Structural sharing, referential equality

## Sync lifecycle

**Connect**:
The `SyncEngine.connect()` call that runs reconciliation and then subscribes the sync engine to the store and the CRDT backend; `disconnect()` removes both subscriptions.
A connected engine says nothing about the network. Providers and simulated links have their own `connect`, which does.
_Avoid_: Start, attach

**Reconciliation**:
The per-key merge `connect()` performs before subscribing: a synced key the CRDT backend holds wins over the store's value, and a synced key only the store holds stays in the store.
_Avoid_: Initial sync, hydration

**Seeding**:
Writing the synced keys only the store holds into the CRDT backend during reconciliation, in one write.
Seeding is unrelated to the random seed of the simulator.
_Avoid_: Initializing, bootstrapping

**Seed strategy**:
The `seed` option in `SyncEngineConfig`: `"if-empty"`, the default, seeds during connect, and `"never"` leaves those keys for the next local change. Despite its name, `"if-empty"` works per key.

**Local change**:
A change made to the store on this peer, which the sync engine writes to the CRDT backend as the whole synced state.
_Avoid_: Outgoing change, store change

**Remote change**:
A change to the document that did not come through the CRDT backend's own `write`, which the sync engine applies to the store.
"Remote" means "not written by this engine", so a direct edit to the document on the same peer is a remote change too.
_Avoid_: Incoming change, peer change

**Echo**:
A store notification raised while the sync engine applies a remote change. The engine ignores echoes, so a store adapter needs no echo suppression of its own.
_Avoid_: Feedback loop

**Pending apply**:
Remote changes the sync engine defers, with its `schedule` option, to the next flush, which applies them all with one read of the CRDT backend. A local change made before the flush runs the apply first, which overrides what that change did to synced keys.
_Avoid_: Queued update, batch

**Offline editing**:
Editing while the provider is disconnected and the sync engine stays connected, so the document records the edits and merges them when the provider reconnects.
Disconnecting the engine instead drops those edits for every key the backend holds, because reconnecting runs reconciliation again.

## Strings and text

**String value**:
A string stored whole as one value, so concurrent writes keep one of them; the default for every string, suited to ids, statuses and timestamps.
_Avoid_: Atomic string

**Text**:
A string stored in the CRDT library's text type (`Y.Text`, `LoroText` or Automerge text), whose concurrent edits merge character by character.
_Avoid_: Collaborative string, rich text

**Path**:
The record keys and array indices from the root of a synced subtree to a nested value, such as `["todos", 0, "title"]`.
_Avoid_: Key path

**Text policy**:
A `TextPolicy` function that, given a path, says whether the string there is text; a CRDT backend takes it as its `text` option, and `getChanges` as `options.text`.
Every backend writing to one document should use the same text policy.

## Diffing

**Change**:
One `[type, key, value]` step of an edit script, whose type is `INSERT`, `UPDATE`, `DELETE` or `PENDING`.
In prose, "change" also means a local or remote change to state, and Automerge has changes of its own; write `Change` when the tuple is meant.

**Edit script**:
The ordered `Change[]` that `getChanges(a, b)` returns to turn `a` into `b`; each numeric key addresses the array or string as revised by the steps before it.
_Avoid_: Patch, delta, changeset

**Pending change**:
A `PENDING` change, whose value is the nested edit script for the container or text at its key, so it is edited in place rather than replaced.
_Avoid_: Recursive change, nested diff

**Fine-grained write**:
A `write` that applies an edit script as small CRDT operations, so a toggle or a keystroke produces one small update instead of replacing the synced subtree.
_Avoid_: Partial write, incremental write

**Apply operations**:
The `ApplyOps` functions, `kind`, `get`, `set`, `remove`, `splice` and, for text, `editText`, through which `applyChanges` applies an edit script to a store or a document in place.

## Persistence

**Persistence**:
Keeping a document in browser storage so its state survives reloads, offline starts and every peer leaving the room; also the handle `createPersistence` returns.
Persistence stores the document, never the store's JSON state.
_Avoid_: Caching, saving state

**Update**:
A binary encoding (`Uint8Array`) of document changes that a persistable document reports and accepts.
An update is not the `UPDATE` change type, which replaces one value in an edit script.
_Avoid_: Patch, delta

**Persistable document**:
An implementation of the `PersistableDoc` contract: a document seen as updates through `encode`, `apply` and `subscribe`, made by a `crdt-*` package's `create*Persistable`.
Persistence, the simulator and the devtools network link all carry documents through it.

**Persistence adapter**:
An implementation of the `PersistenceAdapter` contract: storage that holds an update log per storage key; each `persist-*` package provides one.
_Avoid_: Storage adapter, storage driver

**Update log**:
The append-only list of updates, oldest first, that a persistence adapter holds under one storage key.
_Avoid_: Journal, history

**Storage key**:
The `key` in `PersistenceConfig` that names a stored document, such as its room name. Independent documents need different storage keys.
_Avoid_: Document ID

**Compaction**:
Replacing the updates loaded from an update log with one compacted snapshot, while keeping updates appended after that load. It runs on load, every `compactAfter` appends, and on `compact()`.
_Avoid_: Garbage collection, squashing

**Compacted snapshot**:
The `encode()` of a whole document that compaction stores in place of the updates it merged.

**Version**:
The position of the newest update that a persistence adapter's `load` returned, handed back to `compact`; a log position, not a schema version.

## Testing and tools

**Memory backend**:
The CRDT backend from `createMemoryBackend` in `@homeostate/core/testing`: plain JSON without replication, whose `receive` delivers a remote change.
_Avoid_: Mock backend, fake CRDT

**Memory persistence adapter**:
The persistence adapter from `createMemoryPersistenceAdapter` in `@homeostate/core/testing`, which keeps update logs in memory.

**Simulator**:
The `@homeostate/tool-simulator` package, which runs several peers on a simulated network on virtual time to test that they reach convergence.
_Avoid_: Test harness

**Simulated network**:
The object from `createNetwork` that carries updates between simulator peers as messages, with configurable latency, drop rate and reordering.

**Link**:
A connection between two peers on a simulated network. Cutting it loses the messages on their way; restoring it makes the two peers exchange their whole documents.

**Partition**:
A simulated network split in which peers are linked only within their group; `heal()` links every pair of peers again.

**Virtual time**:
The simulated network's clock, in milliseconds, which only `advance` and `settle` move.
_Avoid_: Fake timers

**Settle**:
Delivering every message on its way, and those they lead to, until none are left.
Settling is not `Persistence.flush()`, which waits for storage work.

**Convergence**:
The state in which every peer's document, every peer's synced state, and each connected peer's store and document agree as JSON. `expectConverged()` throws a `ConvergenceError` otherwise.
Convergence does not mean nothing was lost: a peer that seeds before receiving the room's state converges on one of the two values.
_Avoid_: Consistency

**Randomized run**:
A `runRandomized` test that applies random actions to random peers' stores and cuts or restores random links, then heals, settles and checks convergence.
_Avoid_: Fuzz test, chaos test

**Random seed**:
The `seed` of a simulated network or randomized run, which fixes every random choice so that a failing run can be replayed.

**Devtools**:
The `@homeostate/tool-devtools` panel, which inspects and edits a store's state, compares it with the synced subtree, logs changes and connects or disconnects the sync engine.
_Avoid_: Inspector, debugger

**Devtools source**:
One store the devtools inspect, given as a `DevtoolsSource`: a name and a store adapter, plus optionally its CRDT backend, sync engine, filter, persistence and network link.

**Key status**:
How the devtools classify a top-level store key against the CRDT backend: `synced`, `diverged`, `pending`, `local` or `backend-only`.
Here `pending` means "not in the backend yet", unrelated to a pending change.

**Log origin**:
Where a devtools log entry came from: `local`, `remote`, `devtools` (an edit made in the panel) or `initial`.

**Network link**:
The relay from `createNetworkLink` between the app's document and a second document, the wire, which the provider syncs; the devtools delay or cut its updates to emulate network conditions.

## Packages and integrations

**Core**:
The `@homeostate/core` package: the sync engine, persistence, diffing and the contracts, with no runtime dependencies and no knowledge of any state manager, CRDT library or UI framework.

**Integration package**:
A `store-*`, `crdt-*` or `persist-*` package that implements one contract for one state manager, CRDT library or storage.
_Avoid_: Plugin, extension

**Tool package**:
A `tool-*` package for developing with Homeostate rather than shipping it: the devtools and the simulator.

**Homeostate middleware**:
The `homeostate` Zustand middleware from `@homeostate/store-zustand`, which wraps a state creator, connects a sync engine when the store is created and exposes it as `store.homeostate`.

**Automerge handle**:
The object from `createAutomergeHandle` that holds the current, immutable Automerge document so that the CRDT backend and replication code share it.

**Changeset**:
A `.changeset/*.md` file that records the version bump and changelog entry for changed published packages; see [RELEASE.md](RELEASE.md).
Never use "changeset" for an edit script or a set of updates.
