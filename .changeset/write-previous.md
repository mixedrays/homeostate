---
"@homeostate/core": minor
---

`CrdtBackend.write` takes an optional second argument, `previous`: what the synced subtree holds
now, as `JSON.stringify` would store it. The sync engine passes the synced state it last wrote,
or the whole state it last read after a remote change, so a backend can diff against it instead
of reading its document, and unchanged subtrees match the store's by identity. It passes nothing
for the seed write and after a write that threw. A backend that ignores `previous` works as
before.

Update synced store state immutably. The engine diffs each write against the state it last
wrote, so an array or object changed in place is the same object on both sides and is not
written. Adapters whose `getState()` returns a fresh copy, such as the MobX adapter, are not
affected.

`getChanges` with `json: true` now treats entries holding `undefined` or a function as absent in
`a` as well as in `b`, so a diff against `previous` never removes an entry the document did not
hold.
