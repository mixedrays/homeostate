---
"@homeostate/core": minor
---

A local change made while remote changes wait to be applied is no longer lost. With `schedule`, a
store change made before the flush ran the pending apply first, and the remote state replaced the
store's synced keys, so a keystroke or a toggle that fell in the window disappeared. The same
happened, with or without `schedule`, to a store change made by a listener that heard of a remote
change before the sync engine did.

Now the engine merges the local change into that apply against what the backend held before the
remote changes, and writes the result, passing what the backend holds as `previous`. Records
merge key by key and arrays item by item, matched as `getChanges` matches them, so a local edit
lands on the item it targeted after remote inserts and deletes. Items both sides inserted at one
place keep the remote ones first. Where both sides changed a value differently, the local value
wins, and strings are replaced whole, never merged as text. A record or array the store changed
inside, which the remote side deleted, stays deleted, as the CRDTs do; a value the store replaced
whole is kept. Keys the filter keeps local take no part in the merge.

The merged write counts as a written local change, so it starts the write-loop counts again. The
change still sends one `"remote"` event. After a backend read or write threw, the engine has no
state to merge against, and the remote changes still win.
