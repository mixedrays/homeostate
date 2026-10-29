---
"@homeostate/crdt-loro": patch
---

Report what is committed while an update is applied. Loro notifies listeners before `import`
returns, and `createLoroPersistable` skipped every change until then, so a commit a listener
made in response, such as the sync engine writing what a store derived from the update, was
neither stored nor relayed, and the peers that missed it could not apply any later change of
that document. `apply` now skips only the update it imports.
