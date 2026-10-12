---
"@homeostate/crdt-yjs": minor
---

Report a synced map that a peer replaced. Once a peer set a new map in place of a backend's
nested map, or of a map holding it, the backend lost every write, its store never saw the
peer's state, and nothing told the app. It now calls the new `onRemoved` option once, which
logs the error with `console.error` by default, so the app can connect a new engine over the
map that replaced it. `createYjsBackend` also throws a `TypeError` for a map already removed
from its document.
