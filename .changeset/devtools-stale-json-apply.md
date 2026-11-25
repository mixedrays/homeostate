---
"@homeostate/tool-devtools": patch
---

The JSON editor, in the State tab's JSON view and when editing an object or array in the tree,
no longer applies a draft once the value changed since editing began. It keeps the draft and
disables Apply, as the inline value editor does, so applying can't undo a peer's newer change;
"Load latest" replaces the draft with the current value. Both editors now tell a stale draft by
comparing values rather than their text, and the inline editor follows the value until you type.
