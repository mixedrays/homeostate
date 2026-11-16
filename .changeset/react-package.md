---
"@homeostate/react": minor
---

Add `@homeostate/react`, with the `useSyncStatus(engine)` hook, which re-renders a component when a
sync engine's status changes and not on every local or remote change. It takes any `SyncEngine`,
such as Zustand's or Redux's `store.homeostate`, and renders a disconnected status on the server and
during hydration. It needs React 18 or 19.
