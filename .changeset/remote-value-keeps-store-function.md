---
"@homeostate/core": patch
---

A remote value no longer replaces a store's function. The sync engine judged incoming keys by the
backend's value alone, so a string that an older or buggy peer wrote under the key of an action
replaced the store's function.

Now a key the store holds as a function stays local: it is neither read, written back nor deleted,
so the backend's value stays in the room. This holds on connect, with `schedule`, and under `keys`
and `omit`.
