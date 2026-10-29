---
"@homeostate/store-redux": minor
---

Sync a store of several slices with no replace case of its own. The new `withHomeostate`
wraps any root reducer, such as `combineReducers({ todos, ui })`, so that it answers the new
`replaceState` action by returning its payload as the new root state, and
`createReduxAdapter(store)` now dispatches `replaceState` when no `setStateAction` is passed:

```ts
const store = configureStore({
  reducer: withHomeostate(combineReducers({ todos, ui })),
});
const adapter = createReduxAdapter(store);
```

Before, the replace case had to be a slice reducer, which only replaced the root when that
slice was the root reducer. `replaceState` has a `type` and a `match` type guard, so a slice
can also handle it with `builder.addCase(replaceState<State>, ...)`. Its type, `REPLACE_STATE`
(`"@homeostate/replaceState"`), can be passed to Redux DevTools' `actionsDenylist` and to
Redux Toolkit's `serializableCheck.ignoredActions`; the action type is exported as
`ReplaceStateAction`. Passing a `setStateAction` of your own works as before.
