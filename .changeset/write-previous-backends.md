---
"@homeostate/crdt-yjs": patch
"@homeostate/crdt-loro": patch
"@homeostate/crdt-automerge": patch
---

Diff each write against the `previous` state the sync engine passes, instead of serialising the
document and comparing every item, so a local change costs the change rather than the whole
state. A toggle at 500 todos took 146 µs with Yjs, 1.13 ms with Loro and 298 µs with Automerge,
and now takes 14 µs, 35 µs and 182 µs. The Yjs backend still reads its document when written
inside another transaction, and the Loro backend while other code has uncommitted edits, since
those changes are not reported yet.
