---
"@homeostate/store-mobx": patch
---

Keep MobX running when a backend write fails without the engine's `onError` and MobX's
`disableErrorBoundaries` is configured. MobX then rethrew the error from the adapter's reaction,
which left it mid-batch and stopped every reaction in the app. The adapter now catches the error and
logs it with `console.error`. With MobX's default configuration nothing changes: MobX logs the
error and hands it to `onReactionError`.
