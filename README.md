# Homeostate

pnpm workspace for a state-manager agnostic Yjs sync engine, its store adapters, and a demo playground.

## Packages

| Package | Path | Purpose |
| --- | --- | --- |
| `@homeostate/core` | `packages/core` | `createSyncEngine` and the `StoreAdapter` contract |
| `@homeostate/adapter-zustand` | `packages/adapter-zustand` | Zustand adapter and `yjs` middleware |
| `@homeostate/adapter-mobx` | `packages/adapter-mobx` | MobX adapter |
| `@homeostate/adapter-redux` | `packages/adapter-redux` | Redux adapter |
| `@homeostate/playground` | `packages/playground` | Vite app with Zustand, MobX, and Redux todo demos |
| `@homeostate/websocket-server` | `packages/websocket-server` | y-websocket server used by the playground |

## Scripts

```bash
pnpm install
pnpm dev        # playground on http://localhost:5173 + websocket server on ws://localhost:9999
pnpm build      # builds every package
pnpm typecheck  # tsc -b across the workspace
pnpm lint
```

Run a single package with `pnpm --filter <name> <script>`, for example `pnpm --filter @homeostate/playground dev`.
