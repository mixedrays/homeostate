# @homeostate/crdt-automerge

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
