---
"@homeostate/store-valtio": minor
---

One array method on a synced proxy, such as `splice`, `unshift`, `shift`, `sort` or `reverse`, is
now written once, as one change. Valtio notifies on every property set, and the adapter wrote each
intermediate state, so a peer's concurrent insert duplicated list items, and its concurrent edits
landed on the wrong item or were lost.

Writes are now asynchronous: a mutation reaches the backend after a microtask, together with
every mutation made before it. A remote change that arrives meanwhile is merged with the waiting
mutations, and `engine.disconnect()` writes them first. Code and tests that read the backend
right after a mutation must wait for the write first, such as with `await Promise.resolve()`.
