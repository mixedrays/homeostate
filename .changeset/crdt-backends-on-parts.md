---
"@homeostate/crdt-yjs": patch
"@homeostate/crdt-loro": patch
"@homeostate/crdt-automerge": patch
---

Build the backend with `createCrdtBackend` from `@homeostate/core`, so the default text policy,
what a write diffs against and leaving its own writes out of `subscribe` are written once, in
core. Options, extras such as the Yjs backend's `map` and `origin`, and behaviour are unchanged.
Use it with the `@homeostate/core` release that adds `createCrdtBackend`.
