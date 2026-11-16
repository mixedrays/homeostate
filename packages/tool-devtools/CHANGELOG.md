# @homeostate/tool-devtools

## 0.3.1

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

- 068ac22: Set the Network tab's latency and jitter with stepped sliders instead of presets, or type any delay in milliseconds, up to a minute. A button beside each resets it to 0.
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

- 1dda7ec: Keep the inspected source readable in narrow panels. Give the source selector the available footer space, and show full names on hover and in wrapped options.
- 2671e3e: Add filters to the devtools panel. The State tab filters the tree by a path or a value, showing
  what matches with the containers on the way to it open, and expands or collapses it all at
  once. The Log tab filters changes by the paths they touch and by origin. The settings move the
  floating button to another corner, and `buttonPosition` now sets where it starts, like
  `panelPosition`. In a narrow panel the tabs show only their icons.
- 4f5946b: Inspect log entries as read-only historical snapshots or recorded diffs, and compare a snapshot with the live store without restoring it. Show the target source and sync impact beside Restore, and make full-value inspection and copy actions available in both Sync and Log differences.
- 2671e3e: Add a settings menu to the devtools panel. The gear button next to the close button docks the
  panel to the right, left, bottom or top, and switches its theme between the system's, light
  and dark. The choice is remembered and applies over the `panelPosition` and `theme` props, which
  now set where the panel starts. The panel keeps one size for the sides and another for the top
  and bottom.
- cde0b51: **Breaking:** `DevtoolsSource` no longer takes `filter`. The devtools ask the source's `engine`
  which keys it syncs, so a custom engine filter marks its local keys without being passed twice;
  remove `filter` from your sources. A source without an engine treats keys as the default filter
  does, as before without `filter`.

  The devtools now follow the engine's sync events. A remote change is logged as remote under any
  `schedule`, including `requestAnimationFrame` and a `queueMicrotask` engine connected after the
  devtools started; before, such changes were logged as local. A `connect()` made by the app is
  logged as "Connected: adopted the backend", as one made from the panel was. The connection
  status in the status bar and the tabs updates as soon as the engine connects or disconnects,
  instead of within a second.

- b5e7e0f: Make Sync differences fully inspectable: expand beyond the first ten differences, open full JSON values for long strings and containers, and copy paths or either side's value. Keep inspected paths open as other differences appear or disappear.
- 2671e3e: Show the sync at a glance. The panel's status bar has two toggles: Online takes the network
  link offline and back, and Connected disconnects and reconnects the engine. The notes about a
  disconnected engine or a link that is down moved from above the tabs into the Network tab.
  While the panel is closed, a dot on the floating button flags a disconnected engine, a link that
  is down or has conditions on, or diverged keys, and its tooltip names them. The Sync tab shows,
  under a diverged key, each path that differs with its value in the store and in the backend.
- bf424b8: Navigate the devtools' trees from the keyboard, with keyrove. The State tree and the Sync tab's
  backend document are one tab stop each, navigated as the APG tree view: the arrows move between
  rows and open, close, enter or leave containers, Home and End go to the ends, and typing a key's
  name jumps to it. In the State tree, Enter edits a value, toggles a boolean or edits a container
  as JSON, Escape cancels and puts focus back on the row, and Delete or Backspace deletes the key.

### Patch Changes

- 388c49b: Animate the Homeostate mark. Hovering the devtools button or the panel's logo plays the
  Connect motion: the brackets meet, the crossbar joins them, the diamond grows and a ripple
  spreads. The engine switch shows the mark instead of a colored dot: only the brackets while
  disconnected, and connecting plays the same sequence. Both follow `prefers-reduced-motion`.
- 716d20f: Prevent inline editors from overwriting incoming changes, keep storage-operation failures visible after stats refreshes, report backend read failures without showing false key comparisons, and reject imported log timestamps that cannot be rendered.
- 2671e3e: Highlight the JSON syntax in the State tab's JSON view and wherever the tree edits a value as
  JSON, in the tree's colors. Typing, selecting and undo work as in a plain text field, and long
  lines scroll instead of wrapping.
- ceca144: Give keys named after `Object.prototype` members, such as `constructor` or `toString`, the
  right status: a store key the backend lacks is `pending` instead of `diverged`, a backend key
  the store lacks is `backend-only`, and a replacement or restore without such a key removes it
  from the store. Values compare as the sync engine compares them, so a `__proto__` key no longer
  makes two values equal. A restore that inserts an item into a list keeps the identity of every
  other item, so components showing them do not re-render.
- 2671e3e: Give the devtools panel's content more room. The header is gone: the close button sits at the
  right end of the tabs row, the engine switch moved to the Network tab, and a thin status bar at
  the bottom shows the Homeostate mark and the source, or the switcher between several sources.
  The State tab's Tree and JSON switch now matches the size of the other tabs' toolbar buttons.
  The tabs row is a shade darker than the panel, so it reads as its own bar.
- 8ed9541: Show a Compact or Clear that fails in storage on the Storage tab. `createPersistence` now
  rejects them, so the tab reports the storage error instead of a successful action, and marks
  the document cleared only once it is removed.
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

- 500544e: Add `mountDevtools` in `@homeostate/tool-devtools/mount`, to use the devtools from Angular,
  Vue, Svelte or no framework. It takes the component's props as options and returns `update`
  and `unmount`. The panel brings its own React and loads in the background, so the app needs no
  React. `react` and `react-dom` are now optional peer dependencies, needed only for the
  component.
- 7b487a6: Add network conditions. `createNetworkLink` in `@homeostate/tool-devtools/network` puts a link between the app's document and the one its provider syncs, relaying their binary updates; pass it as a source's `network`. The new Network tab takes the link offline, adds latency and jitter, or makes it flaky, and counts the updates on their way. Coming back online exchanges the whole documents, so both sides merge what the other missed.
- 8ae1a88: Add a Storage tab, non-JSON warnings, and log export and import. Pass what `createPersistence`
  returned as a source's `persistence` to see how many updates the stored document holds and
  their size, compact them, or clear the stored document. The State tab now lists values in
  synced keys that are not plain JSON, such as a `Date`, `Map` or class instance, and marks them
  in the tree, since the engine does not sync them as they are. The Log tab exports the log as a
  JSON file and imports one, so a log recorded elsewhere can be stepped through and restored.

### Patch Changes

- 0d3f7ca: Show the current Homeostate mark on the floating button and in the panel header, and use the
  brand cobalt (sky in dark mode) for primary buttons, switches and focus rings.
- 5657c2b: Drop `aria-pressed` from the Log tab's Pause/Resume button. Its label already names the next
  action, so while recording was paused a screen reader announced "Resume, pressed".
- 111df33: Keep keys typed into a devtools field from reaching the page's own keyboard shortcuts. Past the
  devtools' shadow root a key event's target is the host element, so a page that ignores keys typed
  into inputs could not tell and acted on them: Backspace deleted the page's selection instead of a
  character. Escape and Tab still reach the page.
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

## 0.1.0

### Minor Changes

- 1f9ecd6: Add `@homeostate/tool-devtools`: `HomeostateDevtools`, a floating React button and docked panel to inspect and edit a store's state as a tree or as JSON, compare it with the synced backend document, follow a log of local, remote and devtools changes and restore any of them, and connect or disconnect the sync engine. `open` and `onOpenChange` let the app open the panel from its own UI. Edits go through the source's `adapter.setState`, so the engine syncs them to every peer. The panel renders in a shadow root with its own compiled styles.

### Patch Changes

- Updated dependencies [a643bbe]
- Updated dependencies [0bbf653]
- Updated dependencies [fb76f77]
  - @homeostate/core@0.2.0
