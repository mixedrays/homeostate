# Homeostate

pnpm workspace for a state-manager and CRDT-backend agnostic store sync engine, its store
adapters, its CRDT backends, and a demo playground.

## Packages

| Package | Path | Purpose |
| --- | --- | --- |
| `@homeostate/core` | `packages/core` | `createSyncEngine`, the `StoreAdapter` and `CrdtBackend` contracts, `createMemoryBackend` |
| `@homeostate/crdt-yjs` | `packages/crdt-yjs` | `createYjsBackend`: Yjs implementation of `CrdtBackend` |
| `@homeostate/adapter-zustand` | `packages/adapter-zustand` | Zustand adapter, `homeostate` and `yjs` middleware |
| `@homeostate/adapter-mobx` | `packages/adapter-mobx` | MobX adapter |
| `@homeostate/adapter-redux` | `packages/adapter-redux` | Redux adapter |
| `@homeostate/playground` | `packages/playground` | Vite app with Zustand, MobX, and Redux todo demos |
| `@homeostate/benchmark` | `packages/benchmark` | Benchmarks of core across backends: latency, wire bytes, document growth, heap |
| `@homeostate/websocket-server` | `packages/websocket-server` | y-websocket server used by the playground |

## Scripts

```bash
pnpm install
pnpm dev        # playground on http://localhost:5173 + websocket server on ws://localhost:9999
pnpm build      # builds every package
pnpm typecheck  # tsc -b across the workspace, tests included via tsconfig.test.json
pnpm lint
pnpm test       # vitest across packages/*/src/__tests__
pnpm bench      # benchmark matrix; pnpm bench -- --help for options
```

Run a single package with `pnpm --filter <name> <script>`, for example `pnpm --filter @homeostate/playground dev`.

## Third-Party Notices

`@homeostate/core` and `@homeostate/crdt-yjs` include code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs),
copyright (c) 2021 Joseph R Miles, under the MIT License. The complete notice
is included in [packages/core/THIRD_PARTY_NOTICES.md](packages/core/THIRD_PARTY_NOTICES.md)
and [packages/crdt-yjs/THIRD_PARTY_NOTICES.md](packages/crdt-yjs/THIRD_PARTY_NOTICES.md).
