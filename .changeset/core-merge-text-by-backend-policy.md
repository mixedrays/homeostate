---
"@homeostate/core": minor
---

A local change merged into a remote change the engine has not applied yet no longer deletes a
peer's concurrent edit to the same text. The engine merged every string whole, the local value
winning, and wrote the result over a document that held the peer's edit, so with `schedule`, a
store listener of the document, or a batched write such as Valtio's, what the peer typed vanished
from every peer.

`CrdtBackend` has a new optional member, `text`: the backend's text policy, by path from the
synced root. `createCrdtBackend` sets it from its `text` part, so the Yjs, Loro and Automerge
backends expose the `text` option they were given. The engine merges the strings it marks by
UTF-16 unit, as the backend merges concurrent text edits, and still replaces every other string
whole. A text the store edited and the remote side deleted now stays deleted, as an edit inside a
deleted record or array does. A backend without `text` merges as before.
