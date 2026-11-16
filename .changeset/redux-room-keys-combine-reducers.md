---
"@homeostate/store-redux": patch
---

Document that `combineReducers` drops a room key it has no reducer for on the next action, which
deletes it from the room, and that listing the root reducer's slices in `keys` keeps it there.
