---
"@homeostate/tool-devtools": minor
---

Add `@homeostate/tool-devtools`: `HomeostateDevtools`, a floating React button and docked panel to inspect and edit a store's state as a tree or as JSON, compare it with the synced backend document, follow a log of local, remote and devtools changes and restore any of them, and connect or disconnect the sync engine. Edits go through the source's `adapter.setState`, so the engine syncs them to every peer. The panel renders in a shadow root with its own compiled styles.
