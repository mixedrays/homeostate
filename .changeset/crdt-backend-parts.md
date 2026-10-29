---
"@homeostate/core": minor
---

Export `createCrdtBackend(build, options?)`, which builds a `CrdtBackend` from the parts that
differ by CRDT library, described by `CrdtBackendParts`: `read`, `transact`, which runs one edit
tagged as the backend's own with the library's `ApplyOps`, `watch`, which says whether each
change was the backend's own, and optionally `revision`. `build` receives the text policy from
`CrdtBackendOptions.text`, which defaults to none. The backend it returns diffs each write
against `previous`, or against the document when there is none, or against `{}` when `transact`
had to create the synced map, with `applyChanges` and `json: true`, and leaves its own writes out
of `subscribe`. A backend for another CRDT library no longer has to repeat these steps.
