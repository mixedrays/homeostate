---
"@homeostate/core": patch
---

Skip records and arrays shared by identity when building edit scripts. Local writes that
reuse unchanged containers avoid traversing their contents, particularly in normalized maps,
while changed values retain the same ordered edits and unchanged subtree identities.
