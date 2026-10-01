# @homeostate/core

Sync engine that keeps a store in sync with a CRDT document. Pair it with a store adapter
(`@homeostate/store-*`) and a CRDT backend such as
[`@homeostate/crdt-yjs`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-yjs).

## Install

```bash
npm install @homeostate/core @homeostate/crdt-yjs yjs
```

## Usage

```ts
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";

const engine = createSyncEngine(createYjsBackend(doc, "shared"), adapter, {
  seed: "if-empty",
});
engine.connect();
```

On `connect()`, keys the backend already holds win over the store's values, so a peer joining
a populated room adopts it. Keys only the store has are written to the backend (`seed:
"if-empty"`, the default) or left for the next local change (`seed: "never"`). A reconnect
adopts the backend again, so edits made while disconnected to keys it holds are dropped.

`createPersistence` keeps the CRDT document in browser storage so it survives reloads; see
the [persistence guide](https://homeostate.pages.dev/docs/persistence).
`@homeostate/core/testing` exports in-memory doubles for tests.

See [Concepts](https://homeostate.pages.dev/docs/concepts#connecting) for the full connect
rules and the [documentation](https://homeostate.pages.dev/docs/core/introduction) for the
options and for writing a custom backend.

## License

MIT — see [LICENSE](./LICENSE). Includes code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs);
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
