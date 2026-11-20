---
"@homeostate/store-redux": patch
---

The Redux adapter now throws when dispatching its replace action leaves the store's state the same
object, instead of dropping the remote change without a word. That happened when the root reducer
was not wrapped in `withHomeostate` and had no case for the action, or the action's type was
misspelled: the store kept sending its own changes but never took a peer's. The error names the
action's type and points to `withHomeostate`. `connect()` throws it when the room holds state the
store must take. While connected, the engine reports it to `onError` as a `"store"` error. Redux
DevTools time travel or "Lock changes", and middleware that delays or drops the action, can raise
it too; see the README.
