# @homeostate/crdt-automerge

## 0.3.1

### Patch Changes

- 0d39842: Two peers that each create the synced map no longer lose one peer's keys. Each created its own
  map at the synced key, as a peer that seeds before the room's state arrives does, and Automerge
  shows only one of them, so a key only the other map held disappeared, even one only the room
  held. `read()` now also returns every key only a losing map holds, a key both hold reading as
  the winner's value, and the next write moves those keys into the winning map and empties the
  losing ones, so earlier releases read them too and a key deleted later stays deleted. Documents
  stored with two maps read the same way and are merged by their next write. A moved value is a
  copy, so a peer's edit inside it, made in its own map before that peer receives the move, is lost.
- 7a871ef: Changing a `read()` result no longer changes later reads or what a write diffs against. Until
  now, the backend returned its cached snapshot, so pushing to an array from `read()` made the next
  `read()` report it while the document did not hold it, and a `write` without `previous` diffed
  against the changed copy, which could leave the document unequal to what was written. The backend
  now keeps a copy of its own, and each read returns the objects the last read returned only while
  they still match it, so unchanged subtrees keep their identity between reads. That check visits
  the whole synced state on every read, about 0.07 ms at 1000 todos and 0.4 ms at 5000, so a
  remote change reaches the store that much later.
- e794c1b: Document a known Automerge issue: on `@automerge/automerge` 3.4.1 and 3.5.0, a merge that brings
  a delete of a list item together with an insert after it, while another peer's concurrent update
  of that item is in the same merge or already in the document, leaves the inserted item one index
  too low in the document's view. The backend reads that view, so the affected peer's store shows
  another list order than the other peers, with no error, and its next edit by index changes
  another item for every peer. The README and the docs describe the merge, the symptom and how to
  recover. The backend does not work around it yet.
- 22fc462: Text edits under a key that is empty or holds `/`, such as a record keyed by file path, and
  every text edit under a synced key name with `/`, such as `app/state`, now merge like any other
  text. Until now, the write threw `RangeError: Cannot splice`, so that text stopped syncing, or
  the edit landed in another string, for a key `"a/b"` in `a.b`, even outside the synced key.
  Automerge splices text by a path it joins with `/`, so the backend now finds the text by its
  object ID instead.
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

## 0.3.0

### Minor Changes

- 7c08812: `createAutomergeBackend` accepts any object with `doc`, `change` and `subscribe`, exported as
  `AutomergeDocSource`, so a document holder of your own no longer needs an `update` the backend
  never calls.
- 9a99393: Sync a document kept by automerge-repo. `createAutomergeBackend` now takes a `DocHandle` as
  well as an `AutomergeHandle`, so a `Repo`'s storage and network adapters store and sync what the
  engine writes:

  ```ts
  createAutomergeBackend(await repo.find(url), "shared");
  ```

  The engine picks up every change that did not come through its own write: changes loaded from
  storage, received from peers, or made through `docHandle.change`. Either handle may now hold any
  document type, such as the `unknown` of an untyped `repo.find` or an interface.

- aa7cbc1: Implement `CrdtBackend.revision` from the document's heads. The sync engine then applies a remote
  change another listener heard of first before writing a local change, instead of the write
  bringing back what the peer had deleted.

### Patch Changes

- 55812ce: Implement the `CrdtBackend` whose `read` returns a `JsonObject` and whose `write` takes a
  `JsonObjectInput`. `read()` throws a `TypeError` naming what the synced key holds when a peer
  stored something other than a map there, such as a string, a list or `null`, instead of
  returning it, or `{}` for `null`. The sync engine reports it as before, and `write` still
  replaces the value with a map. Use it with the `@homeostate/core` release that narrows
  `CrdtBackend.read` and `write`.
- 8c3322a: Report and hear changes made while an update is applied. `createAutomergePersistable` skipped
  every change to the handle while `apply` ran, so a change a handle listener made in response,
  such as the sync engine writing what a store derived from the update, was neither stored nor
  relayed, and the peers that missed it could not apply any later change of that document.
  `apply` now skips only the update it applies. `createAutomergeBackend` ignored every change
  while its own write notified, so a peer's update merged at that moment, as a synchronous relay
  does, never reached the store; it now ignores only its own write.
- 3bdd635: Throw from `createAutomergePersistable`'s `apply` for bytes that are not Automerge data. Once a
  document held changes, `A.loadIncremental` skipped such bytes silently, so `createPersistence`
  took a log holding damaged bytes or another CRDT library's update for one it had restored in
  full, and compacted them away. A repeated update, or one waiting for an earlier change, still
  applies without an error.
- a80be3b: Build the backend with `createCrdtBackend` from `@homeostate/core`, so the default text policy,
  what a write diffs against and leaving its own writes out of `subscribe` are written once, in
  core. Options, extras such as the Yjs backend's `map` and `origin`, and behaviour are unchanged.
  Use it with the `@homeostate/core` release that adds `createCrdtBackend`.
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

## 0.2.0

### Minor Changes

- f77d8a6: Add document persistence, so a synced document survives reloads, offline starts, and every peer and the sync server losing it. `createPersistence` in `@homeostate/core` keeps a CRDT document in a `PersistenceAdapter`; `createYjsPersistable`, `createLoroPersistable` and `createAutomergePersistable` expose each backend's document to it; and the new `@homeostate/persist-indexeddb` and `@homeostate/persist-local-storage` packages store it in IndexedDB or Web Storage. `createMemoryPersistenceAdapter` in `@homeostate/core/testing` is an in-memory adapter for tests.
- d8e9906: Store strings as plain values unless a `text` option marks them as collaborative text. Every
  backend stored every string as its text type and merged concurrent replacements character by
  character, so two peers setting a filter to `"active"` and `"completed"` at once converged to
  `"compctiveeted"`; ids and timestamps merged the same way. Concurrent writes of a string now
  keep one of the written values.

  Mark prose that should keep merging with the backend's new `text` option, which receives each
  string's path from the synced root:

  ```ts
  createYjsBackend(doc, "shared", {
    text: (path) => path[0] === "todos" && path[2] === "title",
  });
  ```

  Yjs and Loro store other strings as plain map and list values, and Automerge as
  `ImmutableString`. `read()` returns plain strings for both kinds. Documents written by earlier
  releases hold every string as text: they read as before, and each string is stored as the
  configured kind the next time it changes. Give every backend writing to a document the same
  policy.

  Core adds `getChanges(a, b, { text })`, which replaces strings outside the policy with one
  `UPDATE`; without the option every string is still diffed character by character. It also
  exports the `TextPolicy` and `DiffOptions` types, and exports `applyStringChanges` again for
  backends that find text stored as a plain value.

### Patch Changes

- 456fbad: Write `undefined` and functions the way `JSON.stringify` does in every backend: object entries
  holding them are left out, and such array items, holes included, become `null`. Writing the
  same state again produces no update.

  - Yjs threw halfway through a write on an `undefined` array item or a nested function, and the
    part already applied replicated to peers, sometimes deleting an existing item. `undefined`
    object values were stored as present keys.
  - Loro threw halfway through a write on a nested function or a sparse array, leaving a partial
    subtree that replicated. It stored `undefined` as `null`, and resent every `undefined` array
    item on each write.
  - Automerge threw on every write after the store held an `undefined` array item, so nothing
    synced from that store again, and stored nested functions as `{}`.

  `getChanges` takes `json: true` to diff the new state by that rule, passing only the values its
  changes carry through `toJsonValue`, newly exported from `@homeostate/core`, so a write does not
  copy the whole state. Custom backends should set it on `write(next)`.

- 008091c: Diff each write against the `previous` state the sync engine passes, instead of serialising the
  document and comparing every item, so a local change costs the change rather than the whole
  state. A toggle at 500 todos took 146 µs with Yjs, 1.13 ms with Loro and 298 µs with Automerge,
  and now takes 14 µs, 35 µs and 182 µs. The Yjs backend still reads its document when written
  inside another transaction, and the Loro backend while other code has uncommitted edits, since
  those changes are not reported yet.
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

## 0.1.3

### Patch Changes

- 33c7b14: Mark the package side-effect free, so bundlers can drop modules that are not imported.
- fb76f77: Preserve complete Unicode code points when diffing and applying string edits. Deleting or
  replacing supplementary characters such as emoji no longer corrupts text, deletes adjacent
  characters, or throws in the supplied CRDT backends.

  String `Change` offsets remain UTF-16 code units. A string deletion can now carry a numeric
  UTF-16 deletion length in its third tuple entry; `undefined` still means one unit. Custom
  backends consuming `getChanges` must honor this length in one operation rather than delete
  one code unit per step. Array and object deletion semantics are unchanged.

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
