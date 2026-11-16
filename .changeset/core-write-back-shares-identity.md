---
"@homeostate/core": patch
---

When a store changes a synced key while a remote change is applied, such as a count it derives
or a value it normalises, the write-back no longer makes the backend diff the whole state. The
engine passes the store's own objects as `previous` to that `CrdtBackend.write` wherever they
came from the backend, as it already did for the next local write, so the backend's diff skips
the unchanged parts by identity. This also holds for a store whose `getState` returns copies,
and for the next local write after the engine stops writing back a path. With 5,000 todos and a
derived count, the Yjs backend's write-back takes about 0.01 ms instead of 0.6 ms. `previous`
still equals what the backend holds, and what is written is unchanged.
