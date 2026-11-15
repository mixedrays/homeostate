---
"@homeostate/crdt-automerge": patch
---

Two peers that each create the synced map no longer lose one peer's keys. Each created its own
map at the synced key, as a peer that seeds before the room's state arrives does, and Automerge
shows only one of them, so a key only the other map held disappeared, even one only the room
held. `read()` now also returns every key only a losing map holds, a key both hold reading as
the winner's value, and the next write moves those keys into the winning map and empties the
losing ones, so earlier releases read them too and a key deleted later stays deleted. Documents
stored with two maps read the same way and are merged by their next write. A moved value is a
copy, so a peer's edit inside it, made in its own map before that peer receives the move, is lost.
