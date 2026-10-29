---
"@homeostate/store-zustand": minor
---

The `homeostate` middleware takes the engine's new `keys` and `omit` options, checked against the
store's state: `homeostate(creator, { backend, omit: ["draft"] })` keeps a key local, and a
misspelled key fails to compile. `HomeostateOptions` is generic, `HomeostateOptions<T>`, and
types `filter` by the state too.
