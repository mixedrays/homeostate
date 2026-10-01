# @homeostate/crdt-loro

[Loro](https://github.com/loro-dev/loro) backend for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It maps the synced state onto a `LoroMap` (objects become `LoroMap`, arrays `LoroList`,
strings `LoroText`), so a toggle or a keystroke produces one small update.

## Install

```bash
npm install @homeostate/core @homeostate/crdt-loro loro-crdt
```

## Usage

```ts
import { LoroDoc } from "loro-crdt";
import { createSyncEngine } from "@homeostate/core";
import { createLoroBackend } from "@homeostate/crdt-loro";

const doc = new LoroDoc();
const engine = createSyncEngine(createLoroBackend(doc, "shared"), adapter);
engine.connect();
```

The synced state lives in `doc.getMap("shared")`. Replication is yours to wire, for example
with `doc.subscribeLocalUpdates` on one side and `doc.import` on the other. Loro stores
`undefined` as `null`.

To persist the document, pass `createLoroPersistable(doc)` to `createPersistence`; see the
[persistence guide](https://homeostate.pages.dev/docs/persistence).

## License

MIT — see [LICENSE](./LICENSE). Includes code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs);
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
