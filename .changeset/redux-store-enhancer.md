---
"@homeostate/store-redux": minor
---

Set up sync with one store enhancer. `homeostate({ backend, ...options })` wraps the root
reducer in `withHomeostate`, creates the store adapter and the sync engine, connects when the
store is created, and exposes the engine as `store.homeostate`, typed as `SyncEngine`:

```ts
const store = configureStore({
  reducer: { todos, ui },
  enhancers: (getDefaultEnhancers) =>
    getDefaultEnhancers().prepend(homeostate({ backend })),
});
store.homeostate.disconnect();
```

The options are the ones every setup helper takes: the `backend`, the `connect` mode and the
sync engine's config (`filter`, `keys`, `omit`, `seed`, `schedule`, `onError`), with key names
checked against `homeostate<RootState>(...)`. With `connect: "manual"`, nothing reads or writes
the backend until the app calls `store.homeostate.connect()`. A reducer passed to
`store.replaceReducer` is wrapped too. Placed before the middleware, with `prepend` or with
`compose(homeostate(...), applyMiddleware(...))`, the enhancer sends remote changes through the
middleware; placed after it, with `concat`, remote changes skip it. Works with Redux Toolkit's
`configureStore` and Redux's `createStore`. The options type is exported as
`HomeostateOptions`.

The enhancer's types import `StoreEnhancer` from `redux`, so `redux` is back as an optional
peer dependency, `^4.0.0 || ^5.0.0`, which Redux Toolkit already installs. `createReduxAdapter`
and `ReduxLikeStore` still need no `redux`.
