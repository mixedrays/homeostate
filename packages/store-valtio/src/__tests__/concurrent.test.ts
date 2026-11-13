import * as A from "@automerge/automerge";
import { LoroDoc } from "loro-crdt";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { proxy, snapshot } from "valtio/vanilla";
import {
  createSyncEngine,
  type CrdtBackend,
  type PersistableDoc,
} from "@homeostate/core";
import {
  createAutomergeBackend,
  createAutomergeHandle,
  createAutomergePersistable,
} from "@homeostate/crdt-automerge";
import {
  createLoroBackend,
  createLoroPersistable,
} from "@homeostate/crdt-loro";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createValtioAdapter } from "../index.js";

/** One document per peer, with a fixed ID so that concurrent inserts order the same every run. */
const backends: [
  string,
  (index: number) => { backend: CrdtBackend; doc: PersistableDoc },
][] = [
  [
    "Yjs",
    (index) => {
      const doc = new Y.Doc();
      doc.clientID = index + 1;
      return {
        backend: createYjsBackend(doc, "shared"),
        doc: createYjsPersistable(doc),
      };
    },
  ],
  [
    "Loro",
    (index) => {
      const doc = new LoroDoc();
      doc.setPeerId(index + 1);
      return {
        backend: createLoroBackend(doc, "shared"),
        doc: createLoroPersistable(doc),
      };
    },
  ],
  [
    "Automerge",
    (index) => {
      const handle = createAutomergeHandle<Record<string, unknown>>(
        A.init({ actor: (index + 1).toString(16).padStart(8, "0") }),
      );
      return {
        backend: createAutomergeBackend(handle, "shared"),
        doc: createAutomergePersistable(handle),
      };
    },
  ],
];

/** Lets the writes that mutations queued run. */
const flush = (): Promise<void> => Promise.resolve();

describe.each(backends)("Valtio peers on %s", (_, createDoc) => {
  /** Two peers sharing a room that holds `initial`, and a way to deliver each one's updates. */
  const pair = <T extends object>(initial: () => T) => {
    const peer = (index: number) => {
      const state = proxy(initial());
      return { state, ...createDoc(index) };
    };
    const a = peer(0);
    const b = peer(1);
    createSyncEngine(a.backend, createValtioAdapter(a.state)).connect();
    b.doc.apply(a.doc.encode());
    createSyncEngine(b.backend, createValtioAdapter(b.state)).connect();
    const deliver = (from: typeof a, to: typeof a) =>
      to.doc.apply(from.doc.encode());
    /** Delivers both ways, lets the writes run, and checks that the peers agree. */
    const exchange = async () => {
      deliver(b, a);
      deliver(a, b);
      await flush();
      deliver(b, a);
      deliver(a, b);
      expect(snapshot(a.state)).toEqual(snapshot(b.state));
      expect(a.backend.read()).toEqual(b.backend.read());
      return snapshot(a.state);
    };
    return { a, b, deliver, exchange };
  };

  it("keeps every item once when both peers insert at the front", async () => {
    const { a, b, exchange } = pair(() => ({ log: ["a", "b", "c"] }));

    a.state.log.splice(0, 0, "x");
    b.state.log.splice(0, 0, "y");
    await flush();
    const { log } = await exchange();

    expect(log).toHaveLength(5);
    expect([...log.slice(0, 2)].sort()).toEqual(["x", "y"]);
    expect(log.slice(2)).toEqual(["a", "b", "c"]);
  });

  it("keeps an edit on its row when the other peer inserts in front of it", async () => {
    const { a, b, exchange } = pair(() => ({
      rows: [
        { id: "r1", done: false },
        { id: "r2", done: false },
      ],
    }));

    a.state.rows.splice(0, 0, { id: "r0", done: false });
    b.state.rows[1].done = true;
    await flush();
    const { rows } = await exchange();

    expect(rows).toEqual([
      { id: "r0", done: false },
      { id: "r1", done: false },
      { id: "r2", done: true },
    ]);
  });

  it("keeps an edit on a later row when the other peer removes one before it", async () => {
    const { a, b, exchange } = pair(() => ({
      todos: [
        { id: "t1", done: false },
        { id: "t2", done: false },
        { id: "t3", done: false },
      ],
    }));

    a.state.todos.splice(0, 1);
    b.state.todos[2].done = true;
    await flush();
    const { todos } = await exchange();

    expect(todos).toEqual([
      { id: "t2", done: false },
      { id: "t3", done: true },
    ]);
  });

  it("keeps a mutation whose write waits when a remote change arrives first", async () => {
    const { a, b, deliver, exchange } = pair(() => ({
      log: [] as string[],
      title: "",
    }));

    b.state.title = "from b";
    await flush();
    a.state.log.push("from a");
    deliver(b, a);
    await flush();

    expect(await exchange()).toEqual({ log: ["from a"], title: "from b" });
  });
});
