---
"@homeostate/store-valtio": patch
---

A mutation to a string the backend keeps as text, made while a peer's edit to the same text
arrives before the mutation is written, now keeps both edits instead of deleting the peer's.
