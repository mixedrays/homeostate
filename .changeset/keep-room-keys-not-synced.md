---
"@homeostate/core": minor
---

A peer no longer deletes room keys it does not sync. The sync engine used to make the backend equal
to the store's synced state, so every key outside it was deleted: on connect and with every apply
for an adapter that holds fixed keys, such as MobX's or the Jotai record form, and with every local
write under `keys` or `omit`. A client still on an older app version erased what newer peers added.

Now a write sets the store's synced keys and deletes only the synced keys the store removed: keys it
dropped, or gave a value `filter` rejects. Every other key the backend holds stays as it is, through
connecting, seeding, remote changes, write backs and local changes. A key the store is given during
an apply and holds neither before nor after it is taken as one the store cannot hold, so it is not
written back and no longer trips a `WriteLoopError`.

`CrdtBackend.write` keeps its contract: the engine now passes the whole subtree as `next`, with the
keys it does not sync as the backend holds them, and the whole state it last wrote or read as
`previous`.

**Breaking:** a key that becomes local, through `keys`, `omit` or `filter`, now stays in the room
instead of being deleted with the next write. To remove a key from the room, have a peer whose store
holds it remove it.
