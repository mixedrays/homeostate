---
"@homeostate/core": minor
---

Add `mergeConcurrent(base, local, remote, options?)` and its `MergeOptions`, the three-way merge
the sync engine uses to merge a local change into a pending apply. It merges two JSON values
that descend from one base so each keeps its own changes: records key by key, arrays item by
item as `getChanges` matches them, with both sides' inserts at one place kept, the remote ones
first. Where both sides changed a value, the local value wins; a value the local side deleted
stays deleted, and so does one the remote side deleted where the local side only changed what
was inside it. Entries holding `undefined` or a function are absent, as JSON would store them.
Strings are replaced whole, unless `options.text`, a `TextPolicy`, marks them as text, which
merges them by UTF-16 unit. The engine's merge is unchanged.
