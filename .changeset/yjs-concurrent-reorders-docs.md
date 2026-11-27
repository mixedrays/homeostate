---
"@homeostate/crdt-yjs": patch
---

The README now says that the backend writes a moved list item as a delete and an insert, so peers
that reorder a list at once duplicate items and drop a concurrent edit to the moved item, and links
to the guide on ordering items safely.
