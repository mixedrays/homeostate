# @homeostate/tool-simulator

## 0.3.0

### Minor Changes

- f3f22e8: `advance` and `settle` now check, after every delivery, that no peer's store and document both lose a synced top-level key that no peer deleted, and reject with a `LostKeyError` naming the peer, the key, the virtual time and the seed. `runRandomized` runs the check too, so its error names the step in which a key was lost. Before, a store that dropped a key for a while and got it back once a late update arrived still converged, so the run passed. Runs that passed before can now fail. A key deleted during a delivery, such as by a store subscriber or a timer, is reported as lost: pass `checkLostKeys: false` to `createNetwork`, or in `runRandomized`'s `network`, to turn the check off.

### Patch Changes

- e98195d: **Breaking:** a smaller sync engine API, with one way to do each thing. Migrate as follows:

  - `SyncEngine` drops `isConnected()`, which returned what `getStatus()` holds. Replace
    `engine.isConnected()` with `engine.getStatus().connected`. This also applies to the engine that
    Zustand's and Redux's `store.homeostate`, `syncMobxStore` and `syncStateTree` return. An object
    that implements `SyncEngine` by hand can drop the method.
  - `SyncEvent` gains `"error"`, sent when the engine records a failure, which
    `getStatus().failure` then holds. Work that throws, which used to send no event, now sends
    `"error"`, before `onError` runs or the error propagates. A write loop sends it after the
    `"remote"` of the apply that stopped it. A `switch` over `SyncEvent` must handle it.
  - `SyncEngine` drops `subscribeStatus()`: every change of the status comes with a sync event, so
    `subscribe` tells when to read it. Replace `engine.subscribeStatus(listener)` with
    `engine.subscribe(() => listener())`, and read `engine.getStatus()` in it as before; it returns
    the same object while the status is unchanged, so compare by identity to skip the events that
    change nothing. An object that implements `SyncEngine` by hand can drop the method.
  - `SyncEngineConfig.seed` is a boolean, `true` by default, and the `SeedStrategy` type is gone.
    `"if-empty"` seeded each synced key the backend lacks, not only an empty backend. Replace
    `seed: "if-empty"` with `seed: true`, or leave it out, and `seed: "never"` with `seed: false`.
    This also applies to the options of Zustand's and Redux's `homeostate`, `syncMobxStore`,
    `syncStateTree` and `atomWithSync`. Remove imports of `SeedStrategy`; type a variable that holds
    the option as `boolean`. In plain JavaScript, a leftover `seed: "never"` is truthy and now
    seeds, so replace it.
  - The `ChangeType` object and type are removed; compare a step's `type` with its string literal.
    Replace `ChangeType.INSERT`, `ChangeType.UPDATE` and `ChangeType.DELETE` with `"insert"`,
    `"update"` and `"delete"`, and type a variable that holds a step type as `Change["type"]`.
  - The `"pending"` step type is renamed `"edit"`: a step that edits the container at its key in
    place by its nested script `changes`, as before. `getChanges` returns `"edit"` steps where it
    returned `"pending"` ones. Replace `ChangeType.PENDING` and `"pending"` with `"edit"` wherever
    you build a script or switch on a step's `type`; a `switch` left on `"pending"` no longer
    matches, and TypeScript reports the comparison.
  - `applyStringChanges`, `EditScript` and `Diffable` are no longer exported. `applyStringChanges`
    returned the string a text script leads to, which is the second string given to `getChanges`,
    so use that string; to edit a text in place, use `applyChanges` with `ApplyOps.editText`.
    Replace `EditScript` with the script type of the kind diffed, `RecordChange[]`, `ListChange[]`
    or `TextChange[]`, as `getChanges` returns it, and `Diffable` with
    `JsonObject | unknown[] | string`; `getChanges` still needs both values narrowed to one kind.
  - `count` is required on an array or string delete step: `ListChange` and `TextChange` declare
    `count: number`, no longer `count?: number`. `getChanges` already set it on every such delete,
    so only a script built by hand changes: add `count: 1` to an array or string delete that left
    it out before passing the script to `applyChanges`. In plain JavaScript, such a delete no
    longer removes one item, so add the `count` there too. A record delete still has no `count`.
  - `getChanges` replaces a changed nested string whole by default, as `createCrdtBackend` and
    `mergeConcurrent` already did: without `options.text`, a string in a record or an array that
    changed is one `"update"` step instead of an `"edit"` step with a character-level script, and
    so is what `applyChanges` writes. Two strings passed directly are still diffed character by
    character. Pass `text: () => true` to keep character-level scripts for every nested string, or
    a `TextPolicy` for some. The CRDT backends pass their `text` option, so they are unchanged.
  - `createCrdtBackend` takes the parts as one object, `text` among them, and
    `CrdtBackendOptions` is removed. Replace
    `createCrdtBackend((text) => ({ read, transact, watch, revision }), { text })` with
    `createCrdtBackend({ read, transact, watch, revision, text })`, and build the `ApplyOps` that
    `transact` hands over from the same `text`, which is `undefined` when no string is text: core
    no longer passes a policy with its default applied. `CrdtBackendParts` gains the optional
    `text`. The Yjs, Loro and Automerge backends take their `text` option as before.
  - `CrdtBackend.revision` and `CrdtBackendParts.revision` are required. A backend written by hand,
    or parts passed to `createCrdtBackend`, must implement `revision`; return `undefined` when it
    cannot tell, which keeps the read before every local change that a backend without `revision`
    had. Such a backend now also gets no `previous` when the engine writes back what the store
    changed during a remote apply, or a local change merged into one, since the engine cannot tell
    whether the document changed during `setState`; the backend diffs against its document then.
    The Yjs, Loro, Automerge and memory backends already implement it.
  - `createSyncEngine` takes one options object, as the setup helpers do: the `backend`, the
    `adapter` and the `SyncEngineConfig` options, flat. Replace
    `createSyncEngine(backend, adapter, config)` with
    `createSyncEngine({ backend, adapter, ...config })`, or list the options inline, such as
    `createSyncEngine({ backend, adapter, omit: ["draft"] })`, and
    `createSyncEngine(backend, adapter)` with `createSyncEngine({ backend, adapter })`. The state
    type is still taken from `adapter`. The new `SyncEngineOptions<S>` type names the object. The
    setup helpers' options are unchanged.
  - `filter` takes the key alone, `(key: keyof S & string) => boolean`, and a key the store holds as
    a function is never synced, whatever `filter` returns: the engine neither writes it nor reads the
    backend's value into it. A store that makes a synced key a function deletes it from the backend
    with its next write, as before, and syncs it again once it holds a JSON value. A backend value is
    no longer judged: a synced key always takes it. `defaultSyncFilter` is removed. Drop
    `filter: defaultSyncFilter`; replace `(key, value) => defaultSyncFilter(key, value) && key !==
"draft"` with `(key) => key !== "draft"`, or with `omit: ["draft"]`; elsewhere, replace
    `defaultSyncFilter(key, value)` with `typeof value !== "function"`. A custom filter no longer
    syncs functions it keeps, so it need not exclude them. A rule on any other value has no
    replacement: choose the keys by name, or sync a slice without them with `scopeAdapter`. A filter
    that takes a second parameter fails to compile; in plain JavaScript, it gets `undefined` there.

- 1bfdf95: `runRandomized` no longer reports peers that converge as diverged when updates written after
  its final heal are dropped. With a `dropRate`, a store that writes in answer to remote changes,
  such as a subscriber that keeps a derived key in synced state, writes new updates as the
  documents `heal()` exchanges arrive, and the network can drop those too. The run healed once,
  so a dropped update stayed lost and the run failed with a `ConvergenceError`. It now heals and
  settles again until a round drops nothing, at most 10 rounds, as a provider that resyncs would.
  The steps make the same random choices, so a seed replays the same steps. When the tenth round
  still dropped updates and the peers did not converge, the error says so. `expectConverged()`
  now also says how many updates were dropped since the last `heal()`, so tests that heal by hand
  get the same hint: repeat `heal()` and `settle()` until `stats().dropped` stops growing.
- Updated dependencies [e98195d]
- Updated dependencies [e4e66f6]
- Updated dependencies [d17efad]
- Updated dependencies [7172cf4]
- Updated dependencies [3edede4]
- Updated dependencies [ea86a91]
- Updated dependencies [b2c1521]
- Updated dependencies [038c0e1]
- Updated dependencies [988dec0]
- Updated dependencies [48b0532]
- Updated dependencies [bf8324b]
- Updated dependencies [e97b920]
- Updated dependencies [2756e79]
- Updated dependencies [44a47f2]
- Updated dependencies [fab156f]
- Updated dependencies [e51dad7]
- Updated dependencies [1a6cfb8]
- Updated dependencies [4008d1e]
- Updated dependencies [76ec475]
- Updated dependencies [106f2a4]
- Updated dependencies [b296a2f]
- Updated dependencies [987d676]
- Updated dependencies [3e8a239]
  - @homeostate/core@0.5.0

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
