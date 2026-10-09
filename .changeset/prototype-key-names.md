---
"@homeostate/core": patch
"@homeostate/crdt-yjs": patch
"@homeostate/crdt-loro": patch
"@homeostate/store-valtio": patch
---

Sync keys named after `Object.prototype` members, and stop peers from replacing object
prototypes through a `__proto__` key. `getChanges` and the sync engine compared keys with `in`,
so keys such as `constructor` or `toString` counted as always present and their deletions never
replicated; the Valtio adapter had the same fault. A `__proto__` key is now never diffed and is
left out of remote state at any depth. The Yjs and Loro backends' `read()` turned a peer's
`__proto__` entry into an object's prototype, so its properties, such as `isAdmin`, appeared on
other users' state; it now returns plain objects.
