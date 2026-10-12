---
"@homeostate/core": patch
---

Treat `NaN` as equal to itself, and as `null` with `json: true`, as `JSON.stringify` stores it.
`getChanges` reported a `NaN` that stayed `NaN` as changed, so a store holding one got a new
state object on connect, and a backend rewrote it on every write. With `json: true`, `NaN` and
infinite numbers now diff as `null`, and `toJsonValue` turns them into `null`, so the Yjs, Loro
and Automerge backends store `null`, as the memory backend already did.
