# @homeostate/crdt-yjs

> **Draft / placeholder release.** `0.0.0` reserves the name while the API is still
> being designed. Nothing here is stable — do not depend on it yet.

[Yjs](https://github.com/yjs/yjs) backend for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It maps the synced state onto a `Y.Map` (nested objects become `Y.Map`, arrays `Y.Array`,
strings `Y.Text`) and writes fine-grained operations derived from `getChanges`.

## Install

```bash
npm install @homeostate/core @homeostate/crdt-yjs yjs
```

`yjs` is a peer dependency.

## Usage

```ts
import * as Y from 'yjs';
import { createSyncEngine } from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';

const doc = new Y.Doc();
const engine = createSyncEngine(createYjsBackend(doc, 'shared'), adapter);
engine.connect();
```

The synced state lives in `doc.getMap('shared')`; a middle-of-array delete, a toggle, or a
keystroke each produce one small update.

## License

MIT — see [LICENSE](./LICENSE). Includes code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs);
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
