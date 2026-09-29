# @homeostate/crdt-yjs

## 0.1.3

### Patch Changes

- 33c7b14: Mark the package side-effect free, so bundlers can drop modules that are not imported.
- fb76f77: Preserve complete Unicode code points when diffing and applying string edits. Deleting or
  replacing supplementary characters such as emoji no longer corrupts text, deletes adjacent
  characters, or throws in the supplied CRDT backends.

  String `Change` offsets remain UTF-16 code units. A string deletion can now carry a numeric
  UTF-16 deletion length in its third tuple entry; `undefined` still means one unit. Custom
  backends consuming `getChanges` must honor this length in one operation rather than delete
  one code unit per step. Array and object deletion semantics are unchanged.

- Updated dependencies [a643bbe]
- Updated dependencies [0bbf653]
- Updated dependencies [fb76f77]
  - @homeostate/core@0.2.0

## 0.1.2

### Patch Changes

- 30abf27: Remove draft release warnings, update docs links
- Updated dependencies [30abf27]
  - @homeostate/core@0.1.2

## 0.1.1

### Patch Changes

- 8bd452e: Init release
- Updated dependencies [8bd452e]
  - @homeostate/core@0.1.1
