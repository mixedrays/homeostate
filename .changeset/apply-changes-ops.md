---
"@homeostate/core": minor
---

`applyChanges` now serves CRDT backends as well as stores, and the three supplied backends use
it. It takes the state to reach instead of an edit script, `applyChanges(target, current, next,
ops, options?)`, and diffs `current` against `next` itself; `options` goes to `getChanges`.

`ApplyOps` gains `kind`, which classifies a container as a record, list or text, or a value as
plain; `get`, which reads a child; and an optional `editText` for text. Every operation receives
its container's path, so a backend can store each value per its text policy. A child that is
not the kind of container the diff expects, such as a string held as a plain value, is replaced
whole with its next value. Core also exports the `ContainerKind` type.

To migrate a store adapter, pass the snapshot and the next state instead of
`getChanges(snapshot, next)`, and add `kind` and `get` to its operations.
