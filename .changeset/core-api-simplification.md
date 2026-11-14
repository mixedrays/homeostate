---
"@homeostate/core": minor
"@homeostate/store-zustand": patch
"@homeostate/store-redux": patch
"@homeostate/store-mobx": patch
"@homeostate/store-mobx-state-tree": patch
"@homeostate/store-jotai": patch
"@homeostate/tool-devtools": patch
"@homeostate/tool-simulator": patch
"@homeostate/react": patch
"@homeostate/store-ngrx-signals": patch
"@homeostate/crdt-yjs": patch
"@homeostate/crdt-loro": patch
"@homeostate/crdt-automerge": patch
"@homeostate/store-tanstack": patch
"@homeostate/store-valtio": patch
"@homeostate/persist-indexeddb": patch
"@homeostate/persist-local-storage": patch
---

**Breaking:** a smaller sync engine API, with one way to do each thing. Migrate as follows:

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
