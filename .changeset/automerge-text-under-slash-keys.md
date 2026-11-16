---
"@homeostate/crdt-automerge": patch
---

Text edits under a key that is empty or holds `/`, such as a record keyed by file path, and
every text edit under a synced key name with `/`, such as `app/state`, now merge like any other
text. Until now, the write threw `RangeError: Cannot splice`, so that text stopped syncing, or
the edit landed in another string, for a key `"a/b"` in `a.b`, even outside the synced key.
Automerge splices text by a path it joins with `/`, so the backend now finds the text by its
object ID instead.
