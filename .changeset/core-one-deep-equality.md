---
"@homeostate/core": patch
---

`jsonEqual` and the comparison `getChanges` uses to match array items share one walk, which is
about 8% faster: with 5,000 todos, `jsonEqual` of two equal copies takes 0.69 ms instead of
0.77 ms, and `getChanges` of two equal todo arrays 0.68 ms instead of 0.74 ms, with or without
`json`. Results are unchanged, except that without `json`, `getChanges` no longer matches an
array item with a record that holds an extra key next to an own, non-enumerable `__proto__`
property, which only `Object.defineProperty` can create.
