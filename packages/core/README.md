# @homeostate/core

> **Draft / placeholder release.** `0.0.0` reserves the name while the API is still
> being designed. Nothing here is stable — do not depend on it yet.

State-manager and CRDT-backend agnostic sync engine. It keeps a store, reached through a
`StoreAdapter`, in sync with a `CrdtBackend` such as
[`@homeostate/crdt-yjs`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-yjs),
[`@homeostate/crdt-loro`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-loro), or
[`@homeostate/crdt-automerge`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-automerge).

## Install

```bash
npm install @homeostate/core @homeostate/crdt-yjs yjs
```

`@homeostate/core` has no runtime dependencies; pick a backend package for the CRDT library
you use.

## Usage

```ts
import { createSyncEngine } from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';

const engine = createSyncEngine(createYjsBackend(doc, 'shared'), adapter, { seed: 'if-empty' });
engine.connect();
```

`createMemoryBackend()` is a plain-JSON backend without replication, meant for tests.
`getChanges` is exported so a backend can turn a `write(next)` into fine-grained operations.

See the [repository](https://github.com/mixedrays/homeostate) for the full workspace,
store adapters, and a runnable playground.

## License

MIT — see [LICENSE](./LICENSE). Includes code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs);
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
