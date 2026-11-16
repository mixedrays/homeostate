---
"@homeostate/core": patch
---

`keepIdentity` takes a changed string from `next` whole instead of diffing it character by
character and rebuilding an equal string, since a string has no identity to keep. The sync
engine calls it on every remote apply, so a remote change to a long text field gets much
cheaper: with a 108,000-character text and 2 edits, `keepIdentity` takes 0.004 ms instead of
2 ms. Results are unchanged.
