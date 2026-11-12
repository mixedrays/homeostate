---
"@homeostate/core": patch
---

The sync engine no longer takes concurrent writes for a write loop. It compared whole top-level
keys and stopped writing back on the first apply whose remote state contradicted its last write
back. So a key a subscriber derives, such as a count of a list several peers append to, reported
spurious `WriteLoopError`s and a flapping sync failure, and in a map where each peer writes its own
entry, such as read receipts, a peer's entry stopped reaching the room while other peers changed
theirs.

Now the engine compares the paths the store changes, the record keys from the root, where a change
inside an array or a string counts as a change of that array or string. It stops writing a path
back only once 6 applies in a row find another peer's value there and the store changes it again.
An apply in which the store also changes a path anew, changes the path without a contradiction, or
keeps another peer's new value there starts the count again, and so does a written local change.
An apply that changes the path on neither side leaves the count as it is. Other paths the store
changes are still written, and a stopped path is written back again, without a local change, once
an apply no longer contradicts it. A real loop now stops after a few more round trips.

`WriteLoopError.keys` still names the top-level keys, and each set of them is reported once. The
message now lists the stopped paths, each as an array of record keys, such as `["seenBy","p2"]`.
