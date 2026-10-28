---
"@homeostate/crdt-yjs": minor
---

Implement `CrdtBackend.revision`: it counts the document's transactions that changed something,
and is `undefined` while one is open. The sync engine then applies a remote change another
listener heard of first before writing a local change, instead of the write throwing
`Length exceeded!` on items the peer had deleted. `write` now diffs against the `previous` it is
given even inside another transaction, where it used to read the document; the engine checks the
revision before passing `previous`. Use it with the `@homeostate/core` release that adds
`CrdtBackend.revision`, since an older engine passes `previous` without that check.
