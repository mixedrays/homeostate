---
"@homeostate/crdt-loro": patch
---

A `write` now commits edits that other code made to the document and has not committed yet as
their own change, and reports them through `subscribe` once the write lands. Before, they joined
the write's commit under the backend's origin, so `subscribe` never reported them, and a write
without `previous` overwrote them. The sync engine already picked such edits up before writing a
local change, so apps that only use the backend through the engine see no difference. A write
with nothing pending still makes one commit and reports nothing.
