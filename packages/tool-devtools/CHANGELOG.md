# @homeostate/tool-devtools

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
