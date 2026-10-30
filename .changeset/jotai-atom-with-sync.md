---
"@homeostate/store-jotai": minor
---

Tie sync to Jotai's mounting with `atomWithSync(target, { backend, ...options })`. The target is
a writable atom or a record of atoms. The returned atom reads and writes like its target, connects
a sync engine when it is first mounted in a store and disconnects when its last subscriber
unmounts, so sync no longer has to start at import:

```ts
const syncedAtom = atomWithSync(
  { todos: todosAtom, filter: filterAtom },
  { backend },
);
```

The options are the `backend`, a `CrdtBackend` instance, and the sync engine's config (`filter`,
`keys`, `omit`, `seed`, `schedule`, `onError`), with key names checked against the state. They are
exported as `AtomWithSyncOptions`. There is no `connect` option and no engine to reach.

Only mounting the returned atom, or an atom derived from it, starts sync: reading a record's atom
or the wrapped target does not. Each mount is a reconnect, so edits made while unmounted are
dropped for keys the backend holds. One `atomWithSync` atom syncs one store at a time, and
mounting it in a second store while the first is mounted throws, because a backend skips its own
writes for every subscriber; to sync two stores at once, call `atomWithSync` once per store, each
with its own backend on the same document.

`atomWithSync` needs Jotai 2.12 or later, and throws on mount without it. `createJotaiAdapter`
and the peer range are unchanged.
