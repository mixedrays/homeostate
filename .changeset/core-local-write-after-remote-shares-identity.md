---
"@homeostate/core": patch
---

The first local write after a remote change no longer makes the backend diff the whole state.
After an apply the store takes as it is, the engine passes the store's own objects as
`previous` to the next `CrdtBackend.write` wherever they came from the backend, instead of
those of its fresh read, so the backend's diff skips the unchanged parts by identity, as it
does after a local write. With 5,000 todos, the diff of that write takes about 0.07 ms instead of
0.6 ms. `previous` still equals what the backend holds, and what is written is unchanged.
