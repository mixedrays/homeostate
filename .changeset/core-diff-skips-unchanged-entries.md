---
"@homeostate/core": patch
---

`getChanges` skips a record entry that is the same value or object on both sides before it
looks inside it, so it no longer builds that entry's path or asks the text policy about an
unchanged string. A backend's write diffs with its `text` option, so with a `previous` that
shares no object with `next`, the policy was asked about every string in the state; with 5,000
records of three strings and one changed title, it is now asked once instead of 15,001 times.
The edit scripts are unchanged.
