---
"@homeostate/core": minor
---

Breaking: `CrdtBackend.read` returns a `JsonObject`, the plain object the sync engine has always
read, instead of `unknown`. `JsonObject` is `Record<string, unknown>` and is exported from core.
`write`, `createMemoryBackend` and `MemoryBackend.receive` take a `JsonObjectInput`: any object
but an array or another iterable. State typed with an `interface` still fits, while arrays,
`Map`s, `Set`s and primitives fail to compile. A backend no longer casts what it reads or
writes, and the engine still throws a `TypeError` when `read()` returns something else at
runtime.

`getChanges` only accepts two values of one kind: two records, two arrays or two strings. The
overload that took any two `Diffable`s and returned an `EditScript` is gone, so values of
different kinds fail to compile, and at runtime they throw a `TypeError` naming both kinds
instead of returning `[]`. Its record overload takes `JsonObjectInput`, so states typed with an
`interface` can be diffed. `getChanges` now documents its sequential indices and UTF-16 offsets.

To migrate:

- Convert what `read()` returns to a state typed with an `interface` through `unknown`:
  `backend.read() as unknown as State`. An interface has no index signature, so it does not
  overlap a `JsonObject`. A state typed with a `type` alias converts directly.
- Narrow values typed only as `Diffable` before passing them to `getChanges`, and annotate the
  result as `RecordChange[]`, `ListChange[]` or `TextChange[]`.
