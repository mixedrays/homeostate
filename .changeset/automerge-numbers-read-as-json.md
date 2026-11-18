---
"@homeostate/crdt-automerge": patch
---

`read()` now returns large numbers and values other Automerge code stored as plain JSON.
Automerge stores integers as 64-bit integers, so `Number.MAX_SAFE_INTEGER`, integers beyond it,
and integers below its negation read back as `bigint`s, which `JSON.stringify` and arithmetic
with numbers reject, and integers beyond the 64-bit range, such as `1e21`, were clamped to its
maximum or minimum. The backend now stores such integers as `Float64` values, which read back
as the numbers written, with a double's precision. A 64-bit integer already in the document
reads as the nearest number, and a `Counter` as its value. A peer's change no longer replaces
such a number in the store with a `bigint`.
