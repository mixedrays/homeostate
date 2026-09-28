---
"@homeostate/core": minor
"@homeostate/crdt-yjs": patch
"@homeostate/crdt-loro": patch
"@homeostate/crdt-automerge": patch
---

Preserve complete Unicode code points when diffing and applying string edits. Deleting or
replacing supplementary characters such as emoji no longer corrupts text, deletes adjacent
characters, or throws in the supplied CRDT backends.

String `Change` offsets remain UTF-16 code units. A string deletion can now carry a numeric
UTF-16 deletion length in its third tuple entry; `undefined` still means one unit. Custom
backends consuming `getChanges` must honor this length in one operation rather than delete
one code unit per step. Array and object deletion semantics are unchanged.
