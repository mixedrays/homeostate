# @homeostate/crdt-yjs

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
