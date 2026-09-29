# @homeostate/tool-devtools

## 0.1.0

### Minor Changes

- 1f9ecd6: Add `@homeostate/tool-devtools`: `HomeostateDevtools`, a floating React button and docked panel to inspect and edit a store's state as a tree or as JSON, compare it with the synced backend document, follow a log of local, remote and devtools changes and restore any of them, and connect or disconnect the sync engine. `open` and `onOpenChange` let the app open the panel from its own UI. Edits go through the source's `adapter.setState`, so the engine syncs them to every peer. The panel renders in a shadow root with its own compiled styles.

### Patch Changes

- Updated dependencies [a643bbe]
- Updated dependencies [0bbf653]
- Updated dependencies [fb76f77]
  - @homeostate/core@0.2.0
