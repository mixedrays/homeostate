---
"@homeostate/core": minor
---

Stop exporting `applyStringChanges`. It was only used inside core; `applyChanges` still applies string changes wherever they appear in the state.
