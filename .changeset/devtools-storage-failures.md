---
"@homeostate/tool-devtools": patch
---

Show a Compact or Clear that fails in storage on the Storage tab. `createPersistence` now
rejects them, so the tab reports the storage error instead of a successful action, and marks
the document cleared only once it is removed.
