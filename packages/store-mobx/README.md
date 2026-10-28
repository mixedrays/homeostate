# @homeostate/store-mobx

[MobX](https://mobx.js.org) store adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps the observable fields of a store in sync with a CRDT backend such as Yjs, Loro or Automerge.

## Install

```bash
npm install @homeostate/core @homeostate/store-mobx mobx @homeostate/crdt-yjs yjs
```

`mobx` 6 or 7 is a peer dependency.

## Usage

Pass the store. The adapter syncs its observable data fields; computeds, actions and fields
MobX does not observe stay local, and so do the fields `omit` names, such as a `draft` each
user types on their own:

```ts
import * as Y from "yjs";
import { makeAutoObservable } from "mobx";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createMobxAdapter } from "@homeostate/store-mobx";

class TodoStore {
  todos: { id: string; title: string; done: boolean }[] = [];
  filter = "all";
  draft = "";

  constructor() {
    makeAutoObservable(this);
  }

  add() {
    this.todos.push({
      id: crypto.randomUUID(),
      title: this.draft,
      done: false,
    });
    this.draft = "";
  }
}

const store = new TodoStore();

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createMobxAdapter(store, { omit: ["draft"] }),
);
engine.connect();
```

`keys` syncs only the fields it lists instead, as in
`createMobxAdapter(store, { keys: ["todos"] })`; it does not combine with `omit`. Both take
field names that TypeScript checks against the store, so a typo or a method name is a compile
error, and a list shared as an `as const` constant works. The synced state is typed as the
synced fields without the store's methods, `Pick<TodoStore, "todos" | "filter">` here. A
computed getter looks like a field to TypeScript, so the type includes it unless `omit` names
it; do not list one in `keys`.

The adapter finds the fields when it is created, so make the store observable first: a store
that is not observable throws. A field added to the store later is not synced.

Remote changes write only what differs, inside one action, so unchanged items keep their
identity and `observer` components that read them do not re-render.

When a peer removes a synced key, a class field cannot be deleted, so it is set to
`undefined`; type such fields as optional.

MobX catches errors thrown inside reactions, where the engine writes local changes, so a failed
backend write is only logged by MobX unless you pass the engine's `onError` option.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
