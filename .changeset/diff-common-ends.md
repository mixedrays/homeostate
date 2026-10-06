---
"@homeostate/core": patch
---

Diff faster. `getChanges` skips the items and characters two arrays or strings share at
either end before running its edit script, so an edit costs less the more the values have
in common. One keystroke in a 20,000-character text now diffs in about 70 µs instead of 1 ms.
With `json: true`, records holding no absent entries compare in one pass over their keys.
