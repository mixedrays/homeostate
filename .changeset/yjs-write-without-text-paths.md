---
"@homeostate/crdt-yjs": patch
---

Writing a large value without a `text` policy is faster. The backend built a path for every
array item and object entry it converted to a shared type, which only the text policy reads, so
it now builds them only when there is one. With 5,000 todos, seeding an empty document takes
about 10.8 ms instead of 11.9 ms and adding them all in one store change 10.3 ms instead of
11.8 ms; with 20,000, 38.5 ms instead of 40.1 ms and 39.4 ms instead of 41.3 ms. Writes with a
`text` policy are unchanged.
