---
"@homeostate/crdt-loro": minor
---

Require `loro-crdt` 1.16.4 or later: the peer range is now `^1.16.4`, up from `^1.0.0`. On
loro-crdt 1.0.7 to 1.16.3, with a `text` policy, a local change that deletes a range of a
`LoroText`, such as an emoji and the text after it, could panic Loro's WebAssembly at commit
("Op/hint length mismatch") when the document had a subscriber, which the sync engine always
adds. From then on every read, write and export of that document threw, so the peer's later
changes never reached the room or persistence until the page reloaded. loro-crdt 1.16.4 fixes the
panic. An install that pins loro-crdt below 1.16.4 now gets a peer warning, or an install error
under strict peer resolution, and should upgrade loro-crdt.
