# @homeostate/core

> **Draft / placeholder release.** `0.0.0` reserves the name while the API is still
> being designed. Nothing here is stable — do not depend on it yet.

State-manager agnostic sync engine between a store adapter and a [Yjs](https://github.com/yjs/yjs) document.

## Install

```bash
npm install @homeostate/core yjs
```

`yjs` is a peer dependency.

## Usage

```ts
import { createSyncEngine } from '@homeostate/core';
```

See the [repository](https://github.com/mixedrays/homeostate) for the full workspace,
store adapters, and a runnable playground.

## License

MIT — see [LICENSE](./LICENSE). Includes code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs);
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
