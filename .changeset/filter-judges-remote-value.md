---
"@homeostate/core": patch
---

A remote value no longer replaces a store key that the filter keeps local. The sync engine judged
incoming keys by the backend's value alone, so a string that an older or buggy peer wrote under the
key of an action passed the default filter and replaced the store's function.

Now a backend value is read into the store only when `filter` keeps it and, if the store holds the
key, the store's value too. This holds on connect, while waiting for `ready`, with `schedule`, and
under `keys` and `omit`. A key the store keeps local is neither read, written back nor deleted, so
the backend's value stays in the room. A key the store syncs keeps the store's value when `filter`
rejects the backend's, instead of being deleted, and the store's next write replaces the backend's
value. A key the store does not hold, or holds as `undefined`, is still judged by the backend's
value alone. What the engine writes is still judged by the store's value.
