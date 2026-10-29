---
"@homeostate/crdt-automerge": patch
---

Report and hear changes made while an update is applied. `createAutomergePersistable` skipped
every change to the handle while `apply` ran, so a change a handle listener made in response,
such as the sync engine writing what a store derived from the update, was neither stored nor
relayed, and the peers that missed it could not apply any later change of that document.
`apply` now skips only the update it applies. `createAutomergeBackend` ignored every change
while its own write notified, so a peer's update merged at that moment, as a synchronous relay
does, never reached the store; it now ignores only its own write.
