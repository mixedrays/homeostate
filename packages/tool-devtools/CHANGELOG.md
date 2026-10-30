# @homeostate/tool-devtools

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
