---
"@homeostate/core": patch
---

Write what the store changes while a remote change is applied. The engine ignores store
notifications during `setState`, so a key a reducer normalised, or a subscriber, reaction or
hook derived, in response to a remote change stayed out of the backend, and other peers saw the
old value, until the next unrelated local write. Once the apply ends, the engine now writes the
store's synced state if it differs from what was applied, in one write, including for the apply
on `connect()` and a scheduled apply. A remote change the store keeps as it is still writes
nothing back, and neither does one the store ignores, which leaves `getState()` returning the
same object, so a Redux store without the replace case does not revert the peer's change. A
local change that runs a scheduled apply no longer writes the applied state back as well.
