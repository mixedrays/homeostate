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
---

**Breaking:** a smaller sync engine API, with one way to do each thing. Migrate as follows:

- `SyncEngine` drops `isConnected()` and `isReady()`, which returned what `getStatus()` holds.
  Replace `engine.isConnected()` with `engine.getStatus().connected`, and `engine.isReady()` with
  `engine.getStatus().ready`. This also applies to the engine that Zustand's and Redux's
  `store.homeostate`, `syncMobxStore` and `syncStateTree` return. An object that implements
  `SyncEngine` by hand can drop both methods.
- `SyncEvent` gains `"error"`, sent when the engine records a failure, which
  `getStatus().failure` then holds. Work that throws, which used to send no event, now sends
  `"error"`, before `onError` runs or the error propagates. A write loop sends it after the
  `"remote"` of the apply that stopped it, and a failed wait for `ready` after `"disconnect"`. A
  `switch` over `SyncEvent` must handle it.
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
