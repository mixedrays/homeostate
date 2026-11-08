---
"@homeostate/crdt-yjs": patch
---

A replaced value now stays in the store while its replacement waits for an earlier update. When
a provider delivered a peer's update before one it depends on, Yjs applied the update's deletes
at once and kept the rest waiting, so the store lost the replaced key until the earlier update
arrived, and a store that put back a default could overwrite the peer's value on every peer.
While the document holds such a waiting update, a subscribed backend now shows the state from
before it, keeps its `revision()`, and reports nothing until the earlier update arrives; then
it reports one change. Writes meanwhile merge what the store changed into what the document
holds, objects key by key and arrays and text position by position, so they neither put back a
hidden value nor drop another peer's change. Every other change waits too, including a peer's
change to another key and an update waiting in another shared type of the document.
