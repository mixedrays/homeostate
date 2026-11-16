---
"@homeostate/core": patch
---

`mergeConcurrent` compares less, with the same results. It used to compare the whole remote
value with the base and local values at each level of a nested change, before merging that
level's contents and comparing them again one level down. Now, where the values are records or
arrays, it works out how they compare from merging their contents and from the edit scripts
the array merge needs anyway. A merge of a document of 50 sections, 40 paragraphs and 10 spans
each, with one span changed on each side, takes about 3.6 ms instead of 10.7 ms; with 20,000
todos and each side toggling one, about 4.4 ms instead of 7.7 ms.
