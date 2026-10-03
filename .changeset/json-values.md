---
"@homeostate/core": minor
"@homeostate/crdt-yjs": patch
"@homeostate/crdt-loro": patch
"@homeostate/crdt-automerge": patch
---

Write `undefined` and functions the way `JSON.stringify` does in every backend: object entries
holding them are left out, and such array items, holes included, become `null`. Writing the
same state again produces no update.

- Yjs threw halfway through a write on an `undefined` array item or a nested function, and the
  part already applied replicated to peers, sometimes deleting an existing item. `undefined`
  object values were stored as present keys.
- Loro threw halfway through a write on a nested function or a sparse array, leaving a partial
  subtree that replicated. It stored `undefined` as `null`, and resent every `undefined` array
  item on each write.
- Automerge threw on every write after the store held an `undefined` array item, so nothing
  synced from that store again, and stored nested functions as `{}`.

`toJsonValue`, newly exported from `@homeostate/core`, applies the rule; custom backends should
call it on `write(next)` before `getChanges`.
