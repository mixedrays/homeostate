# @homeostate/core

## 0.5.0

### Minor Changes

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

- d17efad: `StoreAdapter` gains an optional `batchWrites` flag, for a store that notifies once per
  property set, such as a Valtio proxy, on which one `splice`, `unshift`, `shift`, `sort` or
  `reverse` notifies once per item it shifts. Written one by one, those intermediate states made
  every shifted item look replaced, so a peer's concurrent insert duplicated items and its
  concurrent edits landed on the wrong item or were lost.

  With the flag, the sync engine writes local changes once per microtask: the first notification
  queues one write of the store's synced state as it is when the write runs, with one `"local"`
  event. The adapter still notifies synchronously, so echoes of `setState` write nothing. A remote
  change applied while the write waits is merged with the waiting local change, as a local change
  is merged into a pending apply, and the merged state is written at once. `disconnect()` writes a
  waiting local change before it unsubscribes, sending its event first, and still disconnects if
  that write throws. A queued write that throws goes to `onError`, and without it is thrown from
  the microtask as an uncaught error. `scopeAdapter` keeps the flag, and an adapter that wraps one
  with it must keep it too. Adapters without it are written synchronously, as before.

- 988dec0: Add `mergeConcurrent(base, local, remote, options?)` and its `MergeOptions`, the three-way merge
  the sync engine uses to merge a local change into a pending apply. It merges two JSON values
  that descend from one base so each keeps its own changes: records key by key, arrays item by
  item as `getChanges` matches them, with both sides' inserts at one place kept, the remote ones
  first. Where both sides changed a value, the local value wins; a value the local side deleted
  stays deleted, and so does one the remote side deleted where the local side only changed what
  was inside it. Entries holding `undefined` or a function are absent, as JSON would store them.
  Strings are replaced whole, unless `options.text`, a `TextPolicy`, marks them as text, which
  merges them by UTF-16 unit. The engine's merge is unchanged.
- e97b920: A local change merged into a remote change the engine has not applied yet no longer deletes a
  peer's concurrent edit to the same text. The engine merged every string whole, the local value
  winning, and wrote the result over a document that held the peer's edit, so with `schedule`, a
  store listener of the document, or a batched write such as Valtio's, what the peer typed vanished
  from every peer.

  `CrdtBackend` has a new optional member, `text`: the backend's text policy, by path from the
  synced root. `createCrdtBackend` sets it from its `text` part, so the Yjs, Loro and Automerge
  backends expose the `text` option they were given. The engine merges the strings it marks by
  UTF-16 unit, as the backend merges concurrent text edits, and still replaces every other string
  whole. A text the store edited and the remote side deleted now stays deleted, as an edit inside a
  deleted record or array does. A backend without `text` merges as before.

- fab156f: `scopeAdapter` turns a store adapter into one for a slice of the store, so that the sync engine
  treats the slice as the store's whole state. It syncs a nested slice, which `keys` and `omit`
  cannot reach, or several slices of one store to several rooms, with one engine and one backend
  each. It takes `get` and `set`, typed by `AdapterScope<S, T>`. A store change reaches the engine
  only when the slice differs as JSON, so a change elsewhere in the store causes no `backend.write`,
  also with adapters that return fresh copies, such as MobX's, and with a `get` that builds a new
  object.
- 4008d1e: A peer no longer deletes room keys it does not sync. The sync engine used to make the backend equal
  to the store's synced state, so every key outside it was deleted: on connect and with every apply
  for an adapter that holds fixed keys, such as MobX's or the Jotai record form, and with every local
  write under `keys` or `omit`. A client still on an older app version erased what newer peers added.

  Now a write sets the store's synced keys and deletes only the synced keys the store removed: keys it
  dropped, or made a function. Every other key the backend holds stays as it is, through
  connecting, seeding, remote changes, write backs and local changes. A key the store is given during
  an apply and holds neither before nor after it is taken as one the store cannot hold, so it is not
  written back and no longer trips a `WriteLoopError`.

  `CrdtBackend.write` keeps its contract: the engine now passes the whole subtree as `next`, with the
  keys it does not sync as the backend holds them, and the whole state it last wrote or read as
  `previous`.

  **Breaking:** a key that becomes local, through `keys`, `omit` or `filter`, now stays in the room
  instead of being deleted with the next write. To remove a key from the room, have a peer whose store
  holds it remove it.

- 76ec475: A local change made while remote changes wait to be applied is no longer lost. With `schedule`, a
  store change made before the flush ran the pending apply first, and the remote state replaced the
  store's synced keys, so a keystroke or a toggle that fell in the window disappeared. The same
  happened, with or without `schedule`, to a store change made by a listener that heard of a remote
  change before the sync engine did.

  Now the engine merges the local change into that apply against what the backend held before the
  remote changes, and writes the result, passing what the backend holds as `previous`. Records
  merge key by key and arrays item by item, matched as `getChanges` matches them, so a local edit
  lands on the item it targeted after remote inserts and deletes. Items both sides inserted at one
  place keep the remote ones first. Where both sides changed a value differently, the local value
  wins, and strings are replaced whole, never merged as text. A record or array the store changed
  inside, which the remote side deleted, stays deleted, as the CRDTs do; a value the store replaced
  whole is kept. Keys the filter keeps local take no part in the merge.

  The merged write counts as a written local change, so it starts the write-loop counts again. The
  change still sends one `"remote"` event. After a backend read or write threw, the engine has no
  state to merge against, and the remote changes still win.

- 987d676: Read what the sync engine is doing. `getStatus()` returns `{ connected, failure }`, and every
  change of it comes with a sync event, so `subscribe` tells when to read it again:

  ```ts
  engine.subscribe(() => {
    const { connected, failure } = engine.getStatus();
    saveButton.disabled = !connected;
    if (failure) report(failure.error, failure.source);
  });
  ```

  `connected` says whether the engine is done reconciling and subscribed, so that local changes are
  written. It says nothing about the network: it stays `true` while the sync server is down.
  `failure` holds what went wrong and its source until the engine recovers: the next completed
  write, apply or connect clears it, and `disconnect()` keeps it. A `WriteLoopError` shows in every
  build, with or without `onError`. The status is a frozen object, the same one until a field
  changes.

  A failure also sends the new `"error"` sync event; see the migration notes. `onError` and what
  propagates are unchanged. An object that implements `SyncEngine` by hand must add `getStatus`.

### Patch Changes

- e4e66f6: `applyChanges` throws a `TypeError` naming the three kinds, as `getChanges` does, when `target`
  is not a record with two records or a list with two arrays, as `ops.kind` and `current` and
  `next` tell. It used to return without writing anything, so a backend or store adapter that
  handed it the wrong container lost the write with no error. It still writes nothing in that
  case. Inside a backend built with `createCrdtBackend`, the error reaches the sync engine's
  `onError` with the source `"backend"`. The supplied backends and the MobX and Valtio adapters
  always pass matching kinds, so they are unchanged.
- 7172cf4: `getChanges` skips a record entry that is the same value or object on both sides before it
  looks inside it, so it no longer builds that entry's path or asks the text policy about an
  unchanged string. A backend's write diffs with its `text` option, so with a `previous` that
  shares no object with `next`, the policy was asked about every string in the state; with 5,000
  records of three strings and one changed title, it is now asked once instead of 15,001 times.
  The edit scripts are unchanged.
- 3edede4: `keepIdentity` takes a changed string from `next` whole instead of diffing it character by
  character and rebuilding an equal string, since a string has no identity to keep. The sync
  engine calls it on every remote apply, so a remote change to a long text field gets much
  cheaper: with a 108,000-character text and 2 edits, `keepIdentity` takes 0.004 ms instead of
  2 ms. Results are unchanged.
- ea86a91: A store change that leaves every synced key as it was, such as a change to a draft or a UI flag
  under `omit`, no longer calls `backend.write`. The engine skips the write when every synced
  value is still the object or value it last wrote or read, and still sends `'local'`. With the
  Yjs backend, such a change used to run an empty transaction, which also moved the backend's
  `revision`; it now runs none.
- b2c1521: The first local write after a remote change no longer makes the backend diff the whole state.
  After an apply the store takes as it is, the engine passes the store's own objects as
  `previous` to the next `CrdtBackend.write` wherever they came from the backend, instead of
  those of its fresh read, so the backend's diff skips the unchanged parts by identity, as it
  does after a local write. With 5,000 todos, the diff of that write takes about 0.07 ms instead of
  0.6 ms. `previous` still equals what the backend holds, and what is written is unchanged.
- 038c0e1: `mergeConcurrent` compares less, with the same results. It used to compare the whole remote
  value with the base and local values at each level of a nested change, before merging that
  level's contents and comparing them again one level down. Now, where the values are records or
  arrays, it works out how they compare from merging their contents and from the edit scripts
  the array merge needs anyway. A merge of a document of 50 sections, 40 paragraphs and 10 spans
  each, with one span changed on each side, takes about 3.6 ms instead of 10.7 ms; with 20,000
  todos and each side toggling one, about 4.4 ms instead of 7.7 ms.
- 48b0532: `mergeConcurrent`, and so the sync engine's merge of a local change into a pending apply, now
  matches list records by a unique value, such as an `id`. Until now, it matched only items equal
  on both sides and paired the rest by position, so where the remote change inserted or deleted
  items and also changed the item the store edited, the local edit landed on a neighbouring item,
  or was lost, in the store and the backend.

  Now, inside each run of items left unmatched, a base record and a side record are paired first
  when they share a string, number or boolean entry that no other record of either array holds,
  such as `id: "r1"`. A value several records hold, such as `done: false`, pairs none, so a record
  still matches itself where the other side changed another of its entries.
  Records with duplicated or changed ids, items that are not records, and pairs that would cross
  others still pair by position. `getChanges` is unchanged.

- bf8324b: `mergeConcurrent` merges arrays faster, with the same results. A run of one changed item on
  each side, such as a list item edited in place, no longer makes the merge index the primitive
  entries of both whole arrays, since matching by a unique value could only pair those two items
  again. Where a run does need the index, the base array's is built once for both sides, and
  each record's entries are read once. With 20,000 todos and each side toggling one, a merge
  takes about 9 ms instead of 42 ms.
- 2756e79: `jsonEqual` and the comparison `getChanges` uses to match array items share one walk, which is
  about 8% faster: with 5,000 todos, `jsonEqual` of two equal copies takes 0.69 ms instead of
  0.77 ms, and `getChanges` of two equal todo arrays 0.68 ms instead of 0.74 ms, with or without
  `json`. Results are unchanged, except that without `json`, `getChanges` no longer matches an
  array item with a record that holds an extra key next to an own, non-enumerable `__proto__`
  property, which only `Object.defineProperty` can create.
- 44a47f2: A remote apply no longer compares the whole synced state to find what the store changed while it
  was applied. The engine compares the store's state after the apply with the state it gave the
  store, which shares the store's objects wherever the remote change left them, so those parts are
  skipped by identity. With 20,000 todos and one toggled per remote change, an apply on the memory
  backend takes about 16 ms instead of 20 ms. What is written back is unchanged.
- e51dad7: The write that seeds the keys a backend lacks on `connect()` now passes what the engine has just
  read as `previous`. A backend built with `createCrdtBackend` no longer reads its document a
  second time for that write, and diffs it against a `previous` that shares every object with
  `next` but the seeded keys. With the Yjs backend and 5,000 todos, a seeding `connect()` takes
  2.4 ms instead of 4.0 ms.
- 1a6cfb8: When a store changes a synced key while a remote change is applied, such as a count it derives
  or a value it normalises, the write-back no longer makes the backend diff the whole state. The
  engine passes the store's own objects as `previous` to that `CrdtBackend.write` wherever they
  came from the backend, as it already did for the next local write, so the backend's diff skips
  the unchanged parts by identity. This also holds for a store whose `getState` returns copies,
  and for the next local write after the engine stops writing back a path. With 5,000 todos and a
  derived count, the Yjs backend's write-back takes about 0.01 ms instead of 0.6 ms. `previous`
  still equals what the backend holds, and what is written is unchanged.
- 106f2a4: Repair storage after a failed persistence write. CRDT updates can depend on earlier ones, so the
  updates stored after a failed append could not be restored without it: Yjs, Loro and Automerge
  kept them waiting, and a reload reported `'loaded'` but missed every edit since the failure.
  `createPersistence` now stores a snapshot of the whole document again with one compaction after
  the next append that succeeds, and with one on each `flush()`, and on the `destroy()` call that
  stops storing, while the failure is unrepaired. When the log holds an update the document cannot
  apply, the snapshot is appended to the kept log instead.

  `flush()` and `destroy()` now resolve once that repair succeeds. When it fails too, they reject
  with the earliest unrepaired failure's error, as before, and the repair's error goes to
  `onError`. A repair that fails is not retried until another append fails or another barrier
  runs, so storage that keeps failing causes no retry loop.

- b296a2f: A remote value no longer replaces a store's function. The sync engine judged incoming keys by the
  backend's value alone, so a string that an older or buggy peer wrote under the key of an action
  replaced the store's function.

  Now a key the store holds as a function stays local: it is neither read, written back nor deleted,
  so the backend's value stays in the room. This holds on connect, with `schedule`, and under `keys`
  and `omit`.

- 3e8a239: The sync engine no longer takes concurrent writes for a write loop. It compared whole top-level
  keys and stopped writing back on the first apply whose remote state contradicted its last write
  back. So a key a subscriber derives, such as a count of a list several peers append to, reported
  spurious `WriteLoopError`s and a flapping sync failure, and in a map where each peer writes its own
  entry, such as read receipts, a peer's entry stopped reaching the room while other peers changed
  theirs.

  Now the engine compares the paths the store changes, the record keys from the root, where a change
  inside an array or a string counts as a change of that array or string. It stops writing a path
  back only once 6 applies in a row find another peer's value there and the store changes it again.
  An apply in which the store also changes a path anew, changes the path without a contradiction, or
  keeps another peer's new value there starts the count again, and so does a written local change.
  An apply that changes the path on neither side leaves the count as it is. Other paths the store
  changes are still written, and a stopped path is written back again, without a local change, once
  an apply no longer contradicts it. A real loop now stops after a few more round trips.

  `WriteLoopError.keys` still names the top-level keys, and each set of them is reported once. The
  message now lists the stopped paths, each as an array of record keys, such as `["seenBy","p2"]`.

## 0.4.0

### Minor Changes

- 39809d7: Breaking: `Change` is a discriminated union of objects instead of a `[type, key, value]` tuple,
  and `ChangeType` is a const object instead of an `enum`. A script holds one kind of step:
  `RecordChange` for a record, keyed by property name, and `ListChange` or `TextChange` for an
  array or a string, keyed by position. `getChanges` returns the script of the kind of the values
  it diffs, or an `EditScript` for values typed only as `Diffable`, and `applyStringChanges` takes
  a `TextChange[]`. Narrowing a step by `type`, and a pending step by `kind`, replaces the casts.

  Adjacent array items or characters deleted together are now one `delete` step with a `count`,
  which `applyChanges` passes to `splice` or `editText` as one call. Clearing a 5000-item list or a
  5000-character text through the Yjs backend takes one `delete` instead of 5000, and about 1 ms
  instead of 100 to 250 ms.

  To migrate code that reads or builds changes:

  - Destructure properties instead of the tuple: `const { type, key } = change`. An insert or
    update carries `value`; a pending step carries `kind` (`"record"`, `"list"` or `"text"`) and
    its nested `changes`, which used to be its third entry.
  - Apply an array or string delete's `count`, treating an absent one as `1`. A string delete's
    length used to be its third entry. `getChanges` sets it on every array and string delete.
  - `ChangeType.INSERT` and the other members keep their values, and `ChangeType` is still the
    type of the four strings. Code that relied on the `enum` type, rather than its values, now
    takes the string literals.
  - Annotate scripts as `RecordChange[]`, `ListChange[]`, `TextChange[]` or `EditScript` instead of
    `Change[]`, which is a single step of any kind.

  `ApplyOps` is unchanged, so backends and stores that apply changes through `applyChanges` need
  no change.

- a80be3b: Export `createCrdtBackend(build, options?)`, which builds a `CrdtBackend` from the parts that
  differ by CRDT library, described by `CrdtBackendParts`: `read`, `transact`, which runs one edit
  tagged as the backend's own with the library's `ApplyOps`, `watch`, which says whether each
  change was the backend's own, and optionally `revision`. `build` receives the text policy from
  `CrdtBackendOptions.text`, which defaults to none. The backend it returns diffs each write
  against `previous`, or against the document when there is none, or against `{}` when `transact`
  had to create the synced map, with `applyChanges` and `json: true`, and leaves its own writes out
  of `subscribe`. A backend for another CRDT library no longer has to repeat these steps.
- 55812ce: Breaking: `CrdtBackend.read` returns a `JsonObject`, the plain object the sync engine has always
  read, instead of `unknown`. `JsonObject` is `Record<string, unknown>` and is exported from core.
  `write`, `createMemoryBackend` and `MemoryBackend.receive` take a `JsonObjectInput`: any object
  but an array or another iterable. State typed with an `interface` still fits, while arrays,
  `Map`s, `Set`s and primitives fail to compile. A backend no longer casts what it reads or
  writes, and the engine still throws a `TypeError` when `read()` returns something else at
  runtime.

  `getChanges` only accepts two values of one kind: two records, two arrays or two strings. The
  overload that took any two `Diffable`s and returned an `EditScript` is gone, so values of
  different kinds fail to compile, and at runtime they throw a `TypeError` naming both kinds
  instead of returning `[]`. Its record overload takes `JsonObjectInput`, so states typed with an
  `interface` can be diffed. `getChanges` now documents its sequential indices and UTF-16 offsets.

  To migrate:

  - Convert what `read()` returns to a state typed with an `interface` through `unknown`:
    `backend.read() as unknown as State`. An interface has no index signature, so it does not
    overlap a `JsonObject`. A state typed with a `type` alias converts directly.
  - Narrow values typed only as `Diffable` before passing them to `getChanges`, and annotate the
    result as `RecordChange[]`, `ListChange[]` or `TextChange[]`.

- d2a66d8: Resolve `whenLoaded` with a `PersistenceLoadResult` describing the initial load. Before, it
  resolved with `undefined` after a successful, empty, failed or partial restoration alike, so an
  app that awaited it and connected its sync engine could seed defaults over a stored log it had
  failed to read, without telling that apart from a first visit.

  - `{ status: "empty" }`: nothing is stored under the key, even if the document already holds
    state.
  - `{ status: "loaded" }`: every stored update was applied.
  - `{ status: "partial", errors }`: the log was read, but at least one stored update could not be
    applied; `errors` holds what `apply` threw for each, in log order.
  - `{ status: "failed", error }`: storage could not be read; `error` is what the adapter's `load`
    rejected with.

  The errors are the objects `onError` received during the initial load, which is still called as
  before; errors of later appends and compactions are not included. `whenLoaded` still never
  rejects, and still resolves before the initial snapshot is written: a failed initial snapshot
  leaves the result as it was and makes `flush()` reject. `PersistenceLoadResult` is exported from
  `@homeostate/core`.

  Breaking: `Persistence.whenLoaded` is now `Promise<PersistenceLoadResult>` instead of
  `Promise<void>`. Code that only awaits it needs no change. Code that returns or assigns it where
  a `Promise<void>` is expected no longer type-checks: type it as
  `Promise<PersistenceLoadResult>`, or pass `whenLoaded.then(() => {})`. To stop seeding defaults
  over a log that could not be restored, connect only for `"empty"` and `"loaded"`.

- 8ed9541: Report persistence failures through the promises of `Persistence` methods. Before, `flush()`,
  `compact()`, `destroy()` and `clear()` resolved after failed storage work, so callers had to
  track `onError` to learn whether a document was saved or deleted, and an `onError` that threw
  left the internal queue rejected, which could surface as unhandled rejections.

  - `compact()` and `clear()` reject with their storage error. `clear()` still attempts deletion
    after earlier writes failed, and resolves once the document is removed.
  - `flush()` and `destroy()` reject while storage may be missing an update the document
    reported: after a failed append, initial load or initial snapshot, also one that failed
    before the call. They reject with the earliest such error until a compaction writes a
    snapshot of the document, or `clear()` succeeds. A failed automatic compaction, or a stored
    update that cannot be applied, does not make them reject. `destroy()` stops storing even
    when it rejects.
  - `onError` is called once per failure, as it happens, and promises reject with the same error
    object. What `onError` throws is logged with `console.error`, and later storage work still
    runs.
  - A promise left unawaited never becomes an unhandled rejection. `whenLoaded` still never
    rejects, and `stats()` is unchanged.

  Breaking: code that awaits `flush()`, `compact()`, `destroy()` or `clear()` now throws when
  storage fails. Wrap those calls in `try`/`catch` where a failure should not stop the caller,
  for example on teardown, and drop any error flag kept in `onError` only to tell whether an
  operation succeeded. Code that does not await them needs no change.

- ceca144: The sync engine now guarantees that the store holds plain objects. Before it puts a remote value
  into the store, it copies every object whose prototype is neither `Object.prototype` nor `null`
  into a plain object of its own entries, at any depth, as it already left out `__proto__` keys.
  A `CrdtBackend` whose library builds objects by assignment, so that a peer's `__proto__` entry
  becomes a prototype, no longer has to undo that in `read()`; the `CrdtBackend.read` contract now
  says so.

  Export `jsonEqual(a, b)`, the equality the engine uses: whether two values are equal as
  `JSON.stringify` would store them, comparing own keys only and ignoring `__proto__`. Export
  `keepIdentity(previous, next)`, which returns `next` reusing every subtree of `previous` it leaves
  unchanged, as the engine builds the store's next state, so an item that shifts in a list keeps
  its identity.

- aa7cbc1: Apply a remote change the backend holds before writing a local change, even when the engine has
  not heard of it yet. A listener subscribed to the document before `connect()` that changed the
  store as it heard of a peer's change made the engine write over that change, diffing against a
  `previous` the document no longer held: the Yjs and Loro backends threw, so the store's change
  was reported as a backend error and dropped, and the Automerge backend brought back what the
  peer had deleted. The remote change now wins, as it does over a local change made while a
  scheduled apply is pending: what the local change did to synced keys is lost.

  `CrdtBackend` takes an optional `revision()`: a value equal to an earlier one only if the synced
  subtree has not changed since, whether or not `subscribe` has reported the change, and
  `undefined` while the backend cannot tell. Before writing a local change, the engine reads the
  backend unless the revision is the one it recorded when it last synced, and applies what it
  finds first if that differs from what it last synced. A backend without `revision` is read
  before every local change, so a custom backend pays one read per write until it implements
  one. `createMemoryBackend` counts its writes and receives.

  A local change made while a scheduled apply is pending is no longer lost when the engine has
  already applied those remote changes, and the write that follows `setState` passes no
  `previous` when the backend changed during it.

- 3b9d6dc: Export `SetupOptions`, the options every setup helper takes: the `backend`, the `connect`
  mode, `"auto"` or `"manual"`, and the engine's `SyncEngineConfig`. A setup helper is the one
  call in a store adapter package that creates the adapter and the engine for one store; the
  Zustand `homeostate` middleware's options are `SetupOptions`.
- cde0b51: Add `subscribe` and `getSyncedState` to `SyncEngine`. `engine.subscribe(listener)` calls the
  listener after every sync event, a `SyncEvent`: `"local"` once a local change is written,
  `"remote"` once a remote change is applied (once per flush with `schedule`, and for a local
  change that first runs a pending apply), and `"connect"` and `"disconnect"` once
  `isConnected()` has changed. Events are sent synchronously and not at all when the work throws;
  a listener that throws is logged with `console.error` without stopping the other listeners or
  the store's subscribers. `engine.getSyncedState()` returns the store's synced keys with the
  store's own values, connected or not, so tools no longer rebuild the engine's filter.
- 074eadc: Add the `onError` option to `createSyncEngine`, to handle what the store adapter or the backend
  throws once the engine is connected. Without it, a store validation error in `setState` reached
  the provider's message handler and a failed `write` reached the code that changed the store,
  while the engine stayed connected and nothing recorded that the two sides differed. With
  `onError`, the engine catches those errors, from notifications, the scheduled flush and
  `disconnect()`, and calls `onError(error, source)`, where `source` is `"store"` or `"backend"`.
  Without it, errors propagate as before, and `connect()` always throws.

  A `read()` or `getState()` that does not return an object now throws a `TypeError` naming the
  method and what it returned, such as `CrdtBackend.read() must return a plain object, got
string`, from `connect()` or through `onError`. Before, such a backend was treated as empty and
  overwritten by the seed, a backend that came to hold no object cleared the store's synced keys,
  and an adapter returning `undefined` failed with `Cannot convert undefined or null to object`.

  A stopped write loop is reported to `onError` as a `WriteLoopError`, with the source `"store"`
  and the keys in `keys`, once per set of keys and in every build. Without `onError`, the engine
  still warns once in development.

- 7e7171a: `SyncEngineConfig` takes `keys` or `omit`, lists of top-level keys to sync or to keep local, so
  `createSyncEngine(backend, adapter, { omit: ["draft"] })` replaces a `filter` that restates the
  default. They apply in both directions and on connect, on top of `filter`: a key is synced when
  `filter` keeps it and, by name, `keys` lists it or `omit` does not name it. A key the backend
  holds that `keys` does not list is ignored. Both accept readonly lists, such as `as const`
  constants.

  Breaking: `SyncEngineConfig` and `SetupOptions` are generic over the store's state,
  `SyncEngineConfig<S>` and `SetupOptions<S>`, and `createSyncEngine` takes `S` from the adapter.
  `keys` and `omit` accept only the state's key names, so a typo fails to compile, and giving both
  is a type error. `filter` is typed `(key: keyof S & string, value: S[keyof S]) => boolean`.
  Without `S`, the types are as before: keys are strings and values `unknown`.

  To migrate:

  - A filter that compares its `key` with a name the state's type does not declare, such as a key
    only the backend holds, fails to compile; annotate the parameter, `(key: string) => ...`.
  - A config declared as a bare `SyncEngineConfig` and passed to an engine for a typed adapter
    fails to compile; declare it as `SyncEngineConfig<State>`.
  - Both are type aliases now rather than interfaces, so an `interface` can no longer extend
    them; use an intersection type, such as `SetupOptions<State> & MyOptions`.

### Patch Changes

- 60331b4: Write what the store changes while a remote change is applied. The engine ignores store
  notifications during `setState`, so a key a reducer normalised, or a subscriber, reaction or
  hook derived, in response to a remote change stayed out of the backend, and other peers saw the
  old value, until the next unrelated local write. Once the apply ends, the engine now writes the
  store's synced state if it differs from what was applied, in one write, including for the apply
  on `connect()` and a scheduled apply. A remote change the store keeps as it is still writes
  nothing back, and neither does one the store ignores, which leaves `getState()` returning the
  same object, so a Redux store without the replace case does not revert the peer's change. A
  local change that runs a scheduled apply no longer writes the applied state back as well.
- 567932b: Treat `NaN` as equal to itself, and as `null` with `json: true`, as `JSON.stringify` stores it.
  `getChanges` reported a `NaN` that stayed `NaN` as changed, so a store holding one got a new
  state object on connect, and a backend rewrote it on every write. With `json: true`, `NaN` and
  infinite numbers now diff as `null`, and `toJsonValue` turns them into `null`, so the Yjs, Loro
  and Automerge backends store `null`, as the memory backend already did.
- 3bdd635: Keep a stored log that holds updates the document cannot apply. Before, `createPersistence`
  reported such an update to `onError`, applied the rest, then compacted the log into a snapshot
  of the document, which deleted the update, so damaged bytes, or another CRDT library's
  document under a reused key, could no longer be inspected or recovered. Now the initial load,
  automatic compaction and `compact()` leave the log in place whenever an update in it fails to
  apply; the error still goes to `onError` on each attempt, and `whenLoaded` resolves with the
  other updates applied. The initial load appends a snapshot of the document instead, so what it
  held before it was persisted is still stored. `clear()` deletes such a log, after which
  compaction resumes. `PersistableDoc.apply` is now documented to throw for bytes it cannot apply.
- 9a6e0c6: Stop peers from re-writing each other's changes forever. Since the engine writes what a store
  changes while a remote change is applied, peers whose stores change that state again on every
  apply, such as a replace reducer that stamps `updatedAt` or two app versions that normalise a
  key in contradicting ways, kept writing to each other, growing the document's history without
  bound. Once another peer changes the keys the engine's last write back changed and the store
  changes them again, the engine now applies the remote change without writing those keys back,
  and warns once in development naming them. The store keeps its values for those keys, which
  differ from the backend's. A key the store changes anew, such as one it derives from an edit,
  is still written back after every remote change.
- 9ce5ff0: Skip records and arrays shared by identity when building edit scripts. Local writes that
  reuse unchanged containers avoid traversing their contents, particularly in normalized maps,
  while changed values retain the same ordered edits and unchanged subtree identities.

## 0.3.0

### Minor Changes

- 732c2c8: `applyChanges` now serves CRDT backends as well as stores, and the three supplied backends use
  it. It takes the state to reach instead of an edit script, `applyChanges(target, current, next,
ops, options?)`, and diffs `current` against `next` itself; `options` goes to `getChanges`.

  `ApplyOps` gains `kind`, which classifies a container as a record, list or text, or a value as
  plain; `get`, which reads a child; and an optional `editText` for text. Every operation receives
  its container's path, so a backend can store each value per its text policy. A child that is
  not the kind of container the diff expects, such as a string held as a plain value, is replaced
  whole with its next value. Core also exports the `ContainerKind` type.

  To migrate a store adapter, pass the snapshot and the next state instead of
  `getChanges(snapshot, next)`, and add `kind` and `get` to its operations.

- f77d8a6: Add document persistence, so a synced document survives reloads, offline starts, and every peer and the sync server losing it. `createPersistence` in `@homeostate/core` keeps a CRDT document in a `PersistenceAdapter`; `createYjsPersistable`, `createLoroPersistable` and `createAutomergePersistable` expose each backend's document to it; and the new `@homeostate/persist-indexeddb` and `@homeostate/persist-local-storage` packages store it in IndexedDB or Web Storage. `createMemoryPersistenceAdapter` in `@homeostate/core/testing` is an in-memory adapter for tests.
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

- 30e31df: Add `compact()` and `stats()` to the handle `createPersistence` returns. `compact()` merges the
  stored log into one snapshot now, as every `compactAfter` appends do. `stats()` resolves with
  the number of stored updates and their size in bytes, once pending writes finish.
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

- 008091c: `CrdtBackend.write` takes an optional second argument, `previous`: what the synced subtree holds
  now, as `JSON.stringify` would store it. The sync engine passes the synced state it last wrote,
  or the whole state it last read after a remote change, so a backend can diff against it instead
  of reading its document, and unchanged subtrees match the store's by identity. It passes nothing
  for the seed write and after a write that threw. A backend that ignores `previous` works as
  before.

  Update synced store state immutably. The engine diffs each write against the state it last
  wrote, so an array or object changed in place is the same object on both sides and is not
  written. Adapters whose `getState()` returns a fresh copy, such as the MobX adapter, are not
  affected.

  `getChanges` with `json: true` now treats entries holding `undefined` or a function as absent in
  `a` as well as in `b`, so a diff against `previous` never removes an entry the document did not
  hold.

### Patch Changes

- f901667: `SyncEngineConfig` takes an optional `schedule`, which coalesces remote changes. The first
  remote change hands it a `flush`, such as `(flush) => queueMicrotask(flush)`, and every remote
  change before that call is applied to the store with one backend read and one `setState`,
  instead of one each. A local change made while an apply is pending runs it first, and the
  remote changes win: what the local change did to synced keys is lost. `disconnect()` runs a
  pending apply. Without `schedule`, remote changes are applied synchronously as before.
- d858951: Diff faster. `getChanges` skips the items and characters two arrays or strings share at
  either end before running its edit script, so an edit costs less the more the values have
  in common. One keystroke in a 20,000-character text now diffs in about 70 µs instead of 1 ms.
  With `json: true`, records holding no absent entries compare in one pass over their keys.
- 29f8f0d: Clean up after a failed connect. When `connect()` throws while subscribing to the backend or
  the store, the engine now drops the subscription it already made instead of leaving the backend
  listener applying remote changes to a store the engine reports as disconnected. A later
  `connect()` subscribes once to each side.
- 314e268: Sync keys named after `Object.prototype` members, and stop peers from replacing object
  prototypes through a `__proto__` key. `getChanges` and the sync engine compared keys with `in`,
  so keys such as `constructor` or `toString` counted as always present and their deletions never
  replicated; the Valtio adapter had the same fault. A `__proto__` key is now never diffed and is
  left out of remote state at any depth. The Yjs and Loro backends' `read()` turned a peer's
  `__proto__` entry into an object's prototype, so its properties, such as `isAdmin`, appeared on
  other users' state; it now returns plain objects.
- 4564712: Tell a hole from a value in nested arrays. `getChanges` skipped the holes of a sparse array
  inside an array item, so it found no change when a remote state held a value there, and the
  store kept the hole.

## 0.2.0

### Minor Changes

- a643bbe: Stop exporting `applyStringChanges`. It was only used inside core; `applyChanges` still applies string changes wherever they appear in the state.
- 0bbf653: Move `createMemoryBackend` and `MemoryBackend` to the `@homeostate/core/testing` entry, so the root entry only exports what production code uses. Mark the package side-effect free.
- fb76f77: Preserve complete Unicode code points when diffing and applying string edits. Deleting or
  replacing supplementary characters such as emoji no longer corrupts text, deletes adjacent
  characters, or throws in the supplied CRDT backends.

  String `Change` offsets remain UTF-16 code units. A string deletion can now carry a numeric
  UTF-16 deletion length in its third tuple entry; `undefined` still means one unit. Custom
  backends consuming `getChanges` must honor this length in one operation rather than delete
  one code unit per step. Array and object deletion semantics are unchanged.

## 0.1.2

### Patch Changes

- 30abf27: Remove draft release warnings, update docs links

## 0.1.1

### Patch Changes

- 8bd452e: Init release
