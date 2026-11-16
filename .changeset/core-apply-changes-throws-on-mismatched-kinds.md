---
"@homeostate/core": patch
---

`applyChanges` throws a `TypeError` naming the three kinds, as `getChanges` does, when `target`
is not a record with two records or a list with two arrays, as `ops.kind` and `current` and
`next` tell. It used to return without writing anything, so a backend or store adapter that
handed it the wrong container lost the write with no error. It still writes nothing in that
case. Inside a backend built with `createCrdtBackend`, the error reaches the sync engine's
`onError` with the source `"backend"`. The supplied backends and the MobX and Valtio adapters
always pass matching kinds, so they are unchanged.
