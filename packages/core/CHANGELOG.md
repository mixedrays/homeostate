# @homeostate/core

## 0.2.0

### Minor Changes

- a643bbe: Stop exporting `applyStringChanges`. It was only used inside core; `applyChanges` still applies string changes wherever they appear in the state.
- 0bbf653: Move `createMemoryBackend` and `MemoryBackend` to the `@homeostate/core/testing` entry, so the root entry only exports what production code uses. Mark the package side-effect free.
- fb76f77: Preserve complete Unicode code points when diffing and applying string edits. Deleting or
  replacing supplementary characters such as emoji no longer corrupts text, deletes adjacent
  characters, or throws in the supplied CRDT backends.

  String `Change` offsets remain UTF-16 code units. A string deletion can now carry a numeric
  UTF-16 deletion length in its third tuple entry; `undefined` still means one unit. Custom
  backends consuming `getChanges` must honor this length in one operation rather than delete
  one code unit per step. Array and object deletion semantics are unchanged.

## 0.1.2

### Patch Changes

- 30abf27: Remove draft release warnings, update docs links

## 0.1.1

### Patch Changes

- 8bd452e: Init release
