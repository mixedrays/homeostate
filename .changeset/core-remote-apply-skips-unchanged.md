---
"@homeostate/core": patch
---

A remote apply no longer compares the whole synced state to find what the store changed while it
was applied. The engine compares the store's state after the apply with the state it gave the
store, which shares the store's objects wherever the remote change left them, so those parts are
skipped by identity. With 20,000 todos and one toggled per remote change, an apply on the memory
backend takes about 16 ms instead of 20 ms. What is written back is unchanged.
