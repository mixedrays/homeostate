# @homeostate/crdt-yjs

## 0.4.0

### Minor Changes

- ad55a91: **Breaking:** `createYjsBackend` takes fewer options, keeping one way to do each thing. Migrate as
  follows:

  - The `origin` option is gone. `subscribe` skips every transaction with the backend's origin, so
    an origin another writer also used, such as `{ origin: "store" }`, silently hid that writer's
    changes from the store. The origin is now always a `Symbol` unique to the backend. Drop the
    option, and read `backend.origin` after creating the backend wherever you passed your own
    value, such as in `Y.UndoManager`'s `trackedOrigins`.
  - The `onRemoved` option is gone, and so is its default `console.error` log. When a peer
    replaces the synced map, or a map holding it, a connected engine now reports the removal at
    once through its own error path: `onError` receives an `Error` with the source `'backend'`,
    and `getStatus().failure` holds it. Move your `onRemoved` handling to the engine's `onError`,
    or read `getStatus().failure`; the error's message says that the synced `Y.Map` was removed
    from its document. Without `onError`, the error now propagates from the Yjs update that
    removed the map. As before, connect a new engine over the map that replaced it.

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

- 40191e6: An engine that connects while an update waits for an earlier one no longer writes the store's
  old value over the waiting update. When a provider delivered a peer's update before one it
  depends on, a backend no engine was subscribed to read the map without the values the waiting
  update replaced, so `connect()` seeded the store's values for those keys. That write was
  concurrent with the waiting update, and about half the time, by client ID, the old value won on
  every replica. A backend that read or wrote the map after the map's last change before the
  waiting update now shows that content while unsubscribed too, as it does while subscribed, so
  reconciliation writes nothing over a hidden key, and the subscription it starts keeps showing
  that content until the earlier update arrives. A backend with no such content, as one created
  during the wait or after a peer changed the map while the engine was disconnected, still reads
  the map as it is; pass `seed: false` to the engine to avoid the seeding there.
- 988dec0: While an update waits for an earlier one, writes now merge with core's `mergeConcurrent`, with
  the backend's `text` option, instead of a merge of their own. Two cases change:

  - Object entries holding `undefined` or a function count as absent, and such array items as
    `null`, as the document stores them. Before, a value an earlier write in the gap left as
    `undefined` or a function counted as present, so the state `read()` showed could keep an edit
    the document had dropped, or drop one the document kept.
  - A value the store holds equal to the document's is left as it is, so an item the store and a
    peer both inserted at one place is written once where the two arrays are otherwise equal,
    instead of twice.

- 48b0532: While an update waits for an earlier one, the store's change to a list item now lands on that
  item when peers inserted or deleted items beside it and also changed it. Until now, the write
  paired that item with its neighbour, so the change was written into another item, or dropped,
  for every peer, while the store showed it kept until the gap closed. The write's merge, core's
  `mergeConcurrent`, now matches list records by a value no other record of either array holds,
  such as an `id`, before their positions.
- dd79c7d: A backend no longer reads the whole synced map before each remote transaction to keep a copy
  for an update that waits for an earlier one. While such an update waits, it shows what the map
  held when the engine last read or wrote it. With the engine's `schedule`, that is the state at
  its last flush or write, so remote changes waiting for the flush reach the store once the
  earlier update arrives, not before. With 5,000 todos and `schedule`, ten remote transactions
  before one flush now read the map once, in the flush, instead of 11 times; without `schedule`,
  the first remote transaction after `connect()` reads it once instead of twice.
- 519fae5: A replaced value now stays in the store while its replacement waits for an earlier update. When
  a provider delivered a peer's update before one it depends on, Yjs applied the update's deletes
  at once and kept the rest waiting, so the store lost the replaced key until the earlier update
  arrived, and a store that put back a default could overwrite the peer's value on every peer.
  While the document holds such a waiting update, a subscribed backend now shows the state from
  before it, as the engine last read or wrote it, keeps its `revision()`, and reports nothing
  until the earlier update arrives; then it reports one change. Writes meanwhile merge what the
  store changed into what the document holds, objects key by key and arrays and text position by
  position, so they neither put back a hidden value nor drop another peer's change. Every other
  change waits too, including a peer's change to another key and an update waiting in another
  shared type of the document.
- c5ae1a8: After a peer replaces or deletes the synced map, or a map holding it, the backend's `read` and
  `write` now throw. Before, the store's next change emptied the store: the removed map read as
  empty, so the engine took it for a remote change that deleted every synced key, and later
  changes went into the removed map, which no peer sees. Now the engine reports the removal as a
  failure with the source `'backend'`, in `onError` and in `SyncStatus.failure`, and the store
  keeps its state. Without `onError`, the error propagates, as for any backend failure.
- 923e45d: A change elsewhere in the document no longer makes the next store change read the whole synced
  map. The backend's `revision` counted every transaction in the document, so another backend's
  write or an editor's keystroke in a `Y.Text` made the engine read the map and compare it with
  what it last synced. It now counts only the transactions that change the synced map or a type
  inside it. With 5,000 todos, a toggle that follows an insert into another shared type takes
  about 0.07 ms instead of 1.5 ms, and with two backends on one document writing in turn, each
  toggle takes about 0.07 ms instead of 1.1 to 1.2 ms, with no read of the map.
- 90dda9d: Writing a large value without a `text` policy is faster. The backend built a path for every
  array item and object entry it converted to a shared type, which only the text policy reads, so
  it now builds them only when there is one. With 5,000 todos, seeding an empty document takes
  about 10.8 ms instead of 11.9 ms and adding them all in one store change 10.3 ms instead of
  11.8 ms; with 20,000, 38.5 ms instead of 40.1 ms and 39.4 ms instead of 41.3 ms. Writes with a
  `text` policy are unchanged.
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

- de1c8a7: `createYjsBackend` returns a `YjsBackend`, a `CrdtBackend` with two more members: `map`, the
  synced `Y.Map`, and `origin`, which tags every transaction its `write` runs. Track that origin
  with `Y.UndoManager` to undo and redo the store's own edits:

  ```ts
  const backend = createYjsBackend(doc, "shared");
  createSyncEngine(backend, adapter).connect();
  const undoManager = new Y.UndoManager(backend.map, {
    trackedOrigins: new Set([backend.origin]),
  });
  ```

  `createYjsBackend(map, options)` syncs a `Y.Map` you already have, such as one nested in another
  map or in a subdocument; a map that is not part of a document throws a `TypeError`. The new
  `origin` option sets the origin, which must be unique to the backend; it defaults to a private
  Symbol, as before.

- 6f2f2e1: Report a synced map that a peer replaced. Once a peer set a new map in place of a backend's
  nested map, or of a map holding it, the backend lost every write, its store never saw the
  peer's state, and nothing told the app. It now calls the new `onRemoved` option once, which
  logs the error with `console.error` by default, so the app can connect a new engine over the
  map that replaced it. `createYjsBackend` also throws a `TypeError` for a map already removed
  from its document.
- aa7cbc1: Implement `CrdtBackend.revision`: it counts the document's transactions that changed something,
  and is `undefined` while one is open. The sync engine then applies a remote change another
  listener heard of first before writing a local change, instead of the write throwing
  `Length exceeded!` on items the peer had deleted. `write` now diffs against the `previous` it is
  given even inside another transaction, where it used to read the document; the engine checks the
  revision before passing `previous`. Use it with the `@homeostate/core` release that adds
  `CrdtBackend.revision`, since an older engine passes `previous` without that check.

### Patch Changes

- a80be3b: Build the backend with `createCrdtBackend` from `@homeostate/core`, so the default text policy,
  what a write diffs against and leaving its own writes out of `subscribe` are written once, in
  core. Options, extras such as the Yjs backend's `map` and `origin`, and behaviour are unchanged.
  Use it with the `@homeostate/core` release that adds `createCrdtBackend`.
- ceca144: Leave copying objects that a peer's `__proto__` entry gave a prototype to the sync engine, which
  now does it for every backend. `read()` may return such an object as the document holds it; the
  store still never receives one. The Yjs backend still leaves `__proto__` entries of a `Y.Map`
  out of what it reads. Use it with the `@homeostate/core` release whose engine copies such objects.
- 55812ce: Implement the `CrdtBackend` whose `read` returns a `JsonObject` and whose `write` takes a
  `JsonObjectInput`, with no casts at the boundary. Use it with the `@homeostate/core` release
  that narrows `CrdtBackend.read` and `write`.
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

- 732c2c8: Replace a plain array or object that other code stored in the synced map on the next write that
  changes it. Writing over a plain array threw, leaving earlier changes of the write applied on
  Yjs, and changes to a plain object were dropped, so the store and the document disagreed.
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

- 314e268: Sync keys named after `Object.prototype` members, and stop peers from replacing object
  prototypes through a `__proto__` key. `getChanges` and the sync engine compared keys with `in`,
  so keys such as `constructor` or `toString` counted as always present and their deletions never
  replicated; the Valtio adapter had the same fault. A `__proto__` key is now never diffed and is
  left out of remote state at any depth. The Yjs and Loro backends' `read()` turned a peer's
  `__proto__` entry into an object's prototype, so its properties, such as `isAdmin`, appeared on
  other users' state; it now returns plain objects.
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
