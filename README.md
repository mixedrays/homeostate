# Homeostate

pnpm workspace for a state-manager and CRDT-backend agnostic store sync engine, its store
adapters, its CRDT backends, and the apps that demo and benchmark them.

Package names follow the two contracts in `@homeostate/core`: `crdt-*` packages implement
`CrdtBackend` for a CRDT library, `store-*` packages implement `StoreAdapter` for a state
manager. Pick one of each:

```bash
npm install @homeostate/core @homeostate/store-zustand @homeostate/crdt-yjs
```

## Packages

Libraries, under `packages/`.

| Package | Path | Purpose |
| --- | --- | --- |
| `@homeostate/core` | `packages/core` | `createSyncEngine`, the `StoreAdapter` and `CrdtBackend` contracts, `createMemoryBackend` |
| `@homeostate/crdt-yjs` | `packages/crdt-yjs` | `createYjsBackend`: Yjs implementation of `CrdtBackend` |
| `@homeostate/crdt-loro` | `packages/crdt-loro` | `createLoroBackend`: Loro implementation of `CrdtBackend` |
| `@homeostate/crdt-automerge` | `packages/crdt-automerge` | `createAutomergeBackend`: Automerge implementation of `CrdtBackend` |
| `@homeostate/store-zustand` | `packages/store-zustand` | Zustand `StoreAdapter` and the `homeostate` middleware |
| `@homeostate/store-mobx` | `packages/store-mobx` | MobX `StoreAdapter` |
| `@homeostate/store-redux` | `packages/store-redux` | Redux `StoreAdapter` |
| `@homeostate/store-jotai` | `packages/store-jotai` | Jotai `StoreAdapter` |
| `@homeostate/store-valtio` | `packages/store-valtio` | Valtio `StoreAdapter` |
| `@homeostate/store-tanstack` | `packages/store-tanstack` | TanStack Store `StoreAdapter` |
| `@homeostate/store-mobx-state-tree` | `packages/store-mobx-state-tree` | MobX-State-Tree `StoreAdapter` |

## Apps

Private tools and servers, under `apps/`. None of them are published.

| Package | Path | Purpose |
| --- | --- | --- |
| `@homeostate/playground` | `apps/playground` | Vite app with a todo demo per store adapter: Zustand, MobX, Redux, Jotai, Valtio, TanStack Store, MobX-State-Tree |
| `@homeostate/benchmark-crdt` | `apps/benchmark-crdt` | Benchmarks of core across CRDT backends: latency, wire bytes, document growth, heap |
| `@homeostate/benchmark-store` | `apps/benchmark-store` | Counts the React components each store adapter re-renders when a change arrives from a peer |
| `@homeostate/benchmark-ui` | `apps/benchmark-ui` | Vite app that views saved reports from both benchmarks: backends side by side, scaling, run comparison, render counts per adapter |
| `@homeostate/websocket-server-yjs` | `apps/websocket-server-yjs` | y-websocket server used by the playground |

## Scripts

```bash
pnpm install
pnpm dev          # playground on http://localhost:5173 + websocket server on ws://localhost:9999
pnpm build        # builds every package
pnpm typecheck    # tsc -b across the workspace, tests included via tsconfig.test.json
pnpm lint
pnpm test         # vitest across packages/*/src/__tests__ and apps/*/src/__tests__
pnpm bench:crdt   # CRDT backend matrix; pnpm bench:crdt -- --help for options
pnpm bench:store  # render counts per store adapter; pnpm bench:store -- --help for options
pnpm bench:ui     # viewer for reports saved with --json by either benchmark, on http://localhost:5180
```

Run a single package with `pnpm --filter <name> <script>`, for example `pnpm --filter @homeostate/playground dev`.

## Third-Party Notices

`@homeostate/core`, `@homeostate/crdt-yjs`, `@homeostate/crdt-loro`, and
`@homeostate/crdt-automerge` include code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs),
copyright (c) 2021 Joseph R Miles, under the MIT License. The complete notice
is included in [packages/core/THIRD_PARTY_NOTICES.md](packages/core/THIRD_PARTY_NOTICES.md),
[packages/crdt-yjs/THIRD_PARTY_NOTICES.md](packages/crdt-yjs/THIRD_PARTY_NOTICES.md),
[packages/crdt-loro/THIRD_PARTY_NOTICES.md](packages/crdt-loro/THIRD_PARTY_NOTICES.md), and
[packages/crdt-automerge/THIRD_PARTY_NOTICES.md](packages/crdt-automerge/THIRD_PARTY_NOTICES.md).
