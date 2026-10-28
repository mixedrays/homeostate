---
"@homeostate/crdt-loro": minor
---

Implement `CrdtBackend.revision` from the document's op count, which includes ops not committed
yet, and is `undefined` while the document is checked out. The sync engine then applies a remote
change another listener heard of first, or an edit other code has not committed, before writing
a local change, instead of the write throwing `Index out of bound` on items the peer had deleted.
`write` now diffs against the `previous` it is given even while other code has uncommitted
edits, where it used to read the document; the engine checks the revision before passing
`previous`. Use it with the `@homeostate/core` release that adds `CrdtBackend.revision`, since
an older engine passes `previous` without that check.
