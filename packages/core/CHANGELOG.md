# @homeostate/core

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
