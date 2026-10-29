---
"@homeostate/store-redux": minor
---

Accept any store with Redux's interface, and drop the `redux` peer dependency.
`createReduxAdapter` now takes a `ReduxLikeStore`, a store with `getState`, `dispatch` and
`subscribe`, instead of Redux 5's `Store` type, so Redux 4 stores and stores made with
Zustand's `redux` middleware type-check next to Redux 5 and Redux Toolkit stores. The
published types no longer import `redux`, so a Redux Toolkit app installs no extra package,
and a new Redux major needs no release of this package. The replace action creator only has
to return an action with a `type`; the state may travel under any property, not just
`payload`. The type is exported as `ReduxLikeStore`.
