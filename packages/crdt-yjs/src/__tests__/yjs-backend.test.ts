import * as Y from "yjs";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createSyncEngine } from "@homeostate/core";
import {
  addTodo,
  createTestStore,
  describeCrdtBackend,
  threeTodos,
  todo,
  toggleTodo,
  type TodoState,
} from "@homeostate/core/conformance";
import {
  createYjsBackend,
  type YjsBackend,
  type YjsBackendOptions,
} from "../index.js";

const NAME = "shared";

/** What the suite needs of Yjs, whichever map the backend syncs. */
const replication = {
  exchange: (a: Y.Doc, b: Y.Doc) => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  },
  onLocalUpdate: (doc: Y.Doc, listener: (update: Uint8Array) => void) => {
    const handler = (
      update: Uint8Array,
      _origin: unknown,
      _doc: Y.Doc,
      transaction: Y.Transaction,
    ): void => {
      if (transaction.local) listener(update);
    };
    doc.on("update", handler);
    return () => doc.off("update", handler);
  },
  knownFailures: {
    "keeps the document when a read of a foreign value is mutated":
      "read() returns plain values other code stored by reference (task 073)",
  },
};

/** Builds shared types for `value`'s objects and arrays, keeping every key, `__proto__` too. */
const toShared = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const array = new Y.Array<unknown>();
    array.push(value.map(toShared));
    return array;
  }
  if (value !== null && typeof value === "object")
    return new Y.Map(
      Object.entries(value).map(([key, item]) => [key, toShared(item)]),
    );
  return value;
};

/** What the suite needs to look inside the synced map `mapOf` returns. */
const inspection = (mapOf: (doc: Y.Doc) => Y.Map<unknown>) => {
  const at = (doc: Y.Doc, path: (string | number)[]): unknown =>
    path.reduce<unknown>(
      (container, key) =>
        container instanceof Y.Map
          ? container.get(key as string)
          : (container as Y.Array<unknown>).get(key as number),
      mapOf(doc),
    );
  return {
    storeForeign: (doc: Y.Doc, key: string, value: unknown) => {
      mapOf(doc).set(key, value);
    },
    storeForeignContainers: (doc: Y.Doc, key: string, value: unknown) => {
      mapOf(doc).set(key, toShared(value));
    },
    containerId: at,
    isText: (doc: Y.Doc, path: (string | number)[]) =>
      at(doc, path) instanceof Y.Text,
  };
};

describeCrdtBackend("createYjsBackend", {
  createDoc: (id) => {
    const doc = new Y.Doc();
    if (id !== undefined) doc.clientID = id;
    return doc;
  },
  backend: (doc, options) => createYjsBackend(doc, NAME, options),
  ...replication,
  ...inspection((doc) => doc.getMap(NAME)),
});

/**
 * An app's layout, with the synced map nested under `app.todos`. Every replica starts from this
 * one update, so they share the nested map instead of each creating its own.
 */
const layout = (() => {
  const doc = new Y.Doc();
  doc.clientID = 0;
  doc.getMap("app").set("todos", new Y.Map());
  return Y.encodeStateAsUpdate(doc);
})();

const nestedMap = (doc: Y.Doc): Y.Map<unknown> =>
  doc.getMap("app").get("todos") as Y.Map<unknown>;

describeCrdtBackend("createYjsBackend over a nested Y.Map", {
  createDoc: (id) => {
    const doc = new Y.Doc();
    if (id !== undefined) doc.clientID = id;
    Y.applyUpdate(doc, layout);
    return doc;
  },
  backend: (doc, options) => createYjsBackend(nestedMap(doc), options),
  ...replication,
  ...inspection(nestedMap),
});

describe("createYjsBackend", () => {
  it("has no revision inside a transaction, and a new one once its observers are called", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    backend.write({ count: 1 });
    const before = backend.revision?.();
    let observed: unknown;
    doc.getMap(NAME).observe(() => {
      observed = backend.revision?.();
    });

    doc.transact(() => {
      doc.getMap(NAME).set("count", 2);
      expect(backend.revision?.()).toBeUndefined();
    });

    expect(observed).toBeDefined();
    expect(observed).not.toBe(before);
    expect(backend.revision?.()).toBe(observed);
  });

  it("has no revision while a transaction an observer started waits for its observers", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    const map = doc.getMap(NAME);
    const observed: unknown[] = [];
    // Called first, so its transaction has changed the map when the next observer is called.
    map.observe(() => {
      if (!map.has("derived")) map.set("derived", 1);
    });
    map.observe(() => observed.push(backend.revision?.()));

    map.set("count", 1);

    expect(observed).toHaveLength(2);
    expect(observed[0]).toBeUndefined();
    expect(observed[1]).toBeDefined();
  });

  it("keeps its revision for an update the document already holds", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    backend.write({ count: 1 });
    const before = backend.revision?.();

    Y.applyUpdate(doc, Y.encodeStateAsUpdate(doc));

    expect(backend.revision?.()).toBe(before);
  });
});

describe("a removed map", () => {
  /** A replica of `update`, the layout every peer starts from. */
  const replica = (update = layout): Y.Doc => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    return doc;
  };

  /** Like `layout`, with the synced map one level deeper, under `app.section.todos`. */
  const deepLayout = (() => {
    const doc = new Y.Doc();
    doc.clientID = 0;
    const section = new Y.Map<unknown>();
    doc.getMap("app").set("section", section);
    section.set("todos", new Y.Map());
    return Y.encodeStateAsUpdate(doc);
  })();

  /** A connected backend over the nested map, and a peer that replaces the map under `key`. */
  const replacedBy = (
    key: "todos" | "section",
    options?: YjsBackendOptions,
  ) => {
    const deep = key === "section";
    const update = deep ? deepLayout : layout;
    const doc = replica(update);
    const peer = replica(update);
    const synced = deep
      ? ((doc.getMap("app").get("section") as Y.Map<unknown>).get(
          "todos",
        ) as Y.Map<unknown>)
      : nestedMap(doc);
    const backend = createYjsBackend(synced, options);
    const store = createTestStore(threeTodos());
    createSyncEngine(backend, store.adapter).connect();
    replication.exchange(doc, peer);

    const replace = (): void => {
      peer.getMap("app").set(key, new Y.Map());
      replication.exchange(doc, peer);
    };
    return { doc, backend, store, replace };
  };

  it("reports once when a peer replaces the synced map", () => {
    const onRemoved = vi.fn();
    const { doc, replace } = replacedBy("todos", { onRemoved });

    replace();
    doc.getMap("app").set("title", "Mine");

    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(onRemoved).toHaveBeenCalledWith(expect.any(Error));
  });

  it("reports when a peer replaces a map holding the synced map", () => {
    const onRemoved = vi.fn();
    const { replace } = replacedBy("section", { onRemoved });

    replace();

    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it("only reports the removal: reads and store changes after it do not throw", () => {
    const { backend, store, replace } = replacedBy("todos", {
      onRemoved: () => {},
    });

    replace();

    expect(() => backend.read()).not.toThrow();
    expect(() => store.update((s) => toggleTodo(s, "1"))).not.toThrow();
  });

  it("logs the removal with console.error by default", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      replacedBy("todos").replace();

      expect(consoleError).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("stops watching for the removal once unsubscribed", () => {
    const doc = replica();
    const peer = replica();
    const onRemoved = vi.fn();
    const unsubscribe = createYjsBackend(nestedMap(doc), {
      onRemoved,
    }).subscribe(() => {});

    unsubscribe();
    peer.getMap("app").set("todos", new Y.Map());
    replication.exchange(doc, peer);

    expect(onRemoved).not.toHaveBeenCalled();
  });

  it("throws a TypeError for a map already removed from its document", () => {
    const doc = replica();
    const removed = nestedMap(doc);
    doc.getMap("app").delete("todos");

    expect(() => createYjsBackend(removed)).toThrow(TypeError);
  });
});

/** The origins of the transactions `doc` runs while `run` does. */
const originsDuring = (doc: Y.Doc, run: () => void): unknown[] => {
  const origins: unknown[] = [];
  const record = (transaction: Y.Transaction): void => {
    origins.push(transaction.origin);
  };
  doc.on("afterTransaction", record);
  try {
    run();
  } finally {
    doc.off("afterTransaction", record);
  }
  return origins;
};

describe("map and origin", () => {
  it("exposes the synced map and the origin that tags its writes", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);

    const origins = originsDuring(doc, () => backend.write({ count: 1 }));

    expect(backend.map).toBe(doc.getMap(NAME));
    expect(origins).toEqual([backend.origin]);
  });

  it("tags every write with a custom origin, and reports only other origins", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME, { origin: "store" });
    const onRemoteChange = vi.fn();
    backend.subscribe(onRemoteChange);

    const origins = originsDuring(doc, () => backend.write({ count: 1 }));
    doc.transact(() => backend.map.set("count", 2), "store");
    expect(onRemoteChange).not.toHaveBeenCalled();
    doc.transact(() => backend.map.set("count", 3), "editor");

    expect(backend.origin).toBe("store");
    expect(origins).toEqual(["store"]);
    expect(onRemoteChange).toHaveBeenCalledTimes(1);
  });

  it("syncs a store into a nested map, leaving the rest of the document alone", () => {
    const doc = new Y.Doc();
    const app = doc.getMap("app");
    app.set("title", "Mine");
    const todos = new Y.Map<unknown>();
    app.set("todos", todos);
    const store = createTestStore(threeTodos());

    const backend = createYjsBackend(todos);
    createSyncEngine(backend, store.adapter).connect();

    expect(backend.map).toBe(todos);
    expect(app.toJSON()).toEqual({ title: "Mine", todos: threeTodos() });
  });

  it("syncs a map in a subdocument, tagging its writes there", () => {
    const subdoc = new Y.Doc();
    new Y.Doc().getMap("rooms").set("one", subdoc);
    const synced = new Y.Map<unknown>();
    subdoc.getMap("app").set("store", synced);
    const backend = createYjsBackend(synced);
    const onRemoteChange = vi.fn();
    backend.subscribe(onRemoteChange);

    const origins = originsDuring(subdoc, () => backend.write({ count: 1 }));
    subdoc.transact(() => synced.set("count", 2));

    expect(origins).toEqual([backend.origin]);
    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual({ count: 2 });
  });

  it("throws a TypeError for a map outside any document", () => {
    expect(() => createYjsBackend(new Y.Map())).toThrow(TypeError);
  });

  it("keeps the document form as the one inferred from its type", () => {
    expectTypeOf<Parameters<typeof createYjsBackend>>().toEqualTypeOf<
      [doc: Y.Doc, name: string, options?: YjsBackendOptions]
    >();
  });
});

describe("undo", () => {
  it("undoes and redoes the store's own edits with a Y.UndoManager tracking its origin", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    const store = createTestStore(threeTodos());
    createSyncEngine(backend, store.adapter).connect();
    const undo = new Y.UndoManager(backend.map, {
      trackedOrigins: new Set([backend.origin]),
    });
    const toggled = toggleTodo(threeTodos(), "1");

    store.update((s) => toggleTodo(s, "1"));
    undo.stopCapturing();
    store.update((s) => addTodo(s, todo("4")));

    undo.undo();
    expect(store.getState()).toEqual(toggled);
    expect(backend.read()).toEqual(toggled);
    undo.undo();
    expect(store.getState()).toEqual(threeTodos());
    expect(backend.read()).toEqual(threeTodos());
    undo.redo();
    expect(store.getState()).toEqual(toggled);
    expect(backend.read()).toEqual(toggled);

    store.update((s) => toggleTodo(s, "2"));
    expect(backend.read()).toEqual(toggleTodo(toggled, "2"));
  });

  it("leaves a peer's changes alone when it undoes the store's own edit", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    const store = createTestStore(threeTodos());
    createSyncEngine(backend, store.adapter).connect();
    const peerDoc = new Y.Doc();
    replication.exchange(doc, peerDoc);
    const undo = new Y.UndoManager(backend.map, {
      trackedOrigins: new Set([backend.origin]),
    });

    store.update((s) => toggleTodo(s, "1"));
    const peer = createYjsBackend(peerDoc, NAME);
    peer.write(addTodo(peer.read() as unknown as TodoState, todo("4")));
    replication.exchange(doc, peerDoc);
    undo.undo();

    expect(store.getState()).toEqual(addTodo(threeTodos(), todo("4")));
  });
});

describe("an update that waits for an earlier one", () => {
  type State = Record<string, unknown>;

  /** Writes `next` with `backend`, and returns its update as a provider would send it. */
  const sendWrite = (backend: YjsBackend, next: State): Uint8Array => {
    const doc = backend.map.doc as Y.Doc;
    let sent: Uint8Array | undefined;
    const send = (update: Uint8Array): void => {
      sent = update;
    };
    doc.on("update", send);
    backend.write(next);
    doc.off("update", send);
    if (sent === undefined) throw new Error("The write changed nothing");
    return sent;
  };

  /**
   * A writer on client 1 and a reader on `readerId` that both hold `initial`, with the
   * reader's store synced by an engine. Each `write` returns the writer's update, which the
   * test delivers to the reader with `deliver`, in any order. `peer` adds a third replica on
   * client 3 holding `initial`, whose `write` returns its update too. Every backend takes
   * `options`.
   */
  const gap = (initial: State, readerId = 2, options?: YjsBackendOptions) => {
    const writerDoc = new Y.Doc();
    writerDoc.clientID = 1;
    const readerDoc = new Y.Doc();
    readerDoc.clientID = readerId;
    const writer = createYjsBackend(writerDoc, NAME, options);
    writer.write(initial);
    const start = Y.encodeStateAsUpdate(writerDoc);
    Y.applyUpdate(readerDoc, start);
    const backend = createYjsBackend(readerDoc, NAME, options);
    const store = createTestStore<State>({});
    createSyncEngine(backend, store.adapter).connect();
    return {
      writerDoc,
      readerDoc,
      backend,
      store,
      write: (next: State): Uint8Array => sendWrite(writer, next),
      deliver: (update: Uint8Array) => Y.applyUpdate(readerDoc, update),
      peer: () => {
        const doc = new Y.Doc();
        doc.clientID = 3;
        Y.applyUpdate(doc, start);
        const peer = createYjsBackend(doc, NAME, options);
        return { doc, write: (next: State) => sendWrite(peer, next) };
      },
    };
  };

  /** Exchanges every update between `docs`, once the test is done reordering them. */
  const syncAll = (...docs: Y.Doc[]): void => {
    for (const a of docs) for (const b of docs) replication.exchange(a, b);
  };

  it("keeps a replaced key while its replacement waits for an earlier update", () => {
    const { store, write, deliver } = gap({ text: "seed", log: "seed" });
    const u0 = write({ text: "seed", log: "changed" });
    const u1 = write({ text: "changed", log: "changed" });

    deliver(u1);
    expect(store.getState()).toEqual({ text: "seed", log: "seed" });
    deliver(u0);
    expect(store.getState()).toEqual({ text: "changed", log: "changed" });
  });

  it("delays a peer's change to another key until the gap closes", () => {
    const { readerDoc, store, write, deliver } = gap({
      text: "seed",
      log: "seed",
    });
    const peerDoc = new Y.Doc();
    peerDoc.clientID = 3;
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(readerDoc));
    const u0 = write({ text: "seed", log: "changed" });
    const u1 = write({ text: "changed", log: "changed" });

    deliver(u1);
    const before = Y.encodeStateVector(peerDoc);
    createYjsBackend(peerDoc, NAME).write({
      text: "seed",
      log: "seed",
      other: 1,
    });
    deliver(Y.encodeStateAsUpdate(peerDoc, before));
    expect(readerDoc.getMap(NAME).get("other")).toBe(1);
    expect(store.getState()).toEqual({ text: "seed", log: "seed" });
    deliver(u0);
    expect(store.getState()).toEqual({
      text: "changed",
      log: "changed",
      other: 1,
    });
  });

  it("keeps a peer's insert into a list the gap touched when the store changes that list", () => {
    const initial = { list: [1, 2, 3], log: 0 };
    const { writerDoc, readerDoc, store, write, deliver, peer } = gap(initial);
    const other = peer();
    const u0 = write({ ...initial, log: 1 });
    const u1 = write({ list: [1, 9, 3], log: 1 });

    deliver(u1);
    deliver(other.write({ ...initial, list: [1, 2, 3, 7] }));
    expect(readerDoc.getMap(NAME).toJSON()).toEqual({
      list: [1, 3, 7],
      log: 0,
    });
    store.update((state) => ({ ...state, list: [1, 2, 3, 4] }));
    deliver(u0);
    syncAll(writerDoc, readerDoc, other.doc);

    const synced = { list: [1, 9, 3, 7, 4], log: 1 };
    expect(store.getState()).toEqual(synced);
    expect(writerDoc.getMap(NAME).toJSON()).toEqual(synced);
    expect(other.doc.getMap(NAME).toJSON()).toEqual(synced);
  });

  it("merges the store's change inside a list item key by key", () => {
    const initial = { todos: [{ title: "seed", done: false }], log: 0 };
    const { writerDoc, readerDoc, store, write, deliver } = gap(initial);
    const u0 = write({ ...initial, log: 1 });
    const u1 = write({ todos: [{ title: "changed", done: false }], log: 1 });

    deliver(u1);
    store.update((state) => ({
      ...state,
      todos: [{ title: "seed", done: true }],
    }));
    expect(readerDoc.getMap(NAME).toJSON()).toEqual({
      todos: [{ done: true }],
      log: 0,
    });
    deliver(u0);
    syncAll(writerDoc, readerDoc);

    const synced = { todos: [{ title: "changed", done: true }], log: 1 };
    expect(store.getState()).toEqual(synced);
    expect(writerDoc.getMap(NAME).toJSON()).toEqual(synced);
  });

  it("keeps the store's value when it and a peer replace the same list item during the gap", () => {
    const initial = { list: [1, 2, 3], text: "seed" };
    const { writerDoc, readerDoc, store, write, deliver, peer } = gap(initial);
    const other = peer();
    const u0 = write({ ...initial, text: "middle" });
    const u1 = write({ ...initial, text: "changed" });

    deliver(u1);
    deliver(other.write({ ...initial, list: [1, 8, 3] }));
    store.update((state) => ({ ...state, list: [1, 5, 3] }));
    deliver(u0);
    syncAll(writerDoc, readerDoc, other.doc);

    const synced = { list: [1, 5, 3], text: "changed" };
    expect(store.getState()).toEqual(synced);
    expect(other.doc.getMap(NAME).toJSON()).toEqual(synced);
  });

  it("keeps the store's replacement of a list item the gap replaced, beside the gap's", () => {
    const initial = { list: [1, 2, 3], log: 0 };
    const { writerDoc, readerDoc, store, write, deliver } = gap(initial);
    const u0 = write({ ...initial, log: 1 });
    const u1 = write({ list: [1, 9, 3], log: 1 });

    deliver(u1);
    store.update((state) => ({ ...state, list: [1, 5, 3] }));
    deliver(u0);
    syncAll(writerDoc, readerDoc);

    // As when two peers replace one item at once: an array keeps both new items.
    const synced = { list: [1, 9, 5, 3], log: 1 };
    expect(store.getState()).toEqual(synced);
    expect(writerDoc.getMap(NAME).toJSON()).toEqual(synced);
  });

  it("drops the store's change inside an object the gap replaced", () => {
    const initial = { todo: { title: "seed", done: false }, log: 0 };
    const { writerDoc, readerDoc, store, write, deliver } = gap(initial);
    const u0 = write({ ...initial, log: 1 });
    let u1: Uint8Array | undefined;
    writerDoc.once("update", (update: Uint8Array) => {
      u1 = update;
    });
    writerDoc.getMap(NAME).set("todo", new Y.Map<unknown>([["title", "new"]]));

    deliver(u1 as Uint8Array);
    store.update((state) => ({
      ...state,
      todo: { title: "seed", done: true },
    }));
    expect(readerDoc.getMap(NAME).has("todo")).toBe(false);
    deliver(u0);
    syncAll(writerDoc, readerDoc);

    // As the document would, had the store changed the replaced map.
    const synced = { todo: { title: "new" }, log: 1 };
    expect(store.getState()).toEqual(synced);
    expect(writerDoc.getMap(NAME).toJSON()).toEqual(synced);
  });

  describe("with text", () => {
    const options: YjsBackendOptions = { text: () => true };

    it("merges the store's edit with a gap that replaced part of the text", () => {
      const initial = { note: "hello world", log: "seed" };
      const { writerDoc, readerDoc, store, write, deliver } = gap(
        initial,
        2,
        options,
      );
      const u0 = write({ ...initial, log: "changed" });
      const u1 = write({ note: "hello there", log: "changed" });

      deliver(u1);
      // The gap deleted what the update replaced, and keeps the rest waiting.
      expect(readerDoc.getMap(NAME).toJSON().note).not.toContain("world");
      store.update((state) => ({ ...state, note: "Hello world" }));
      deliver(u0);
      syncAll(writerDoc, readerDoc);

      const synced = { note: "Hello there", log: "changed" };
      expect(store.getState()).toEqual(synced);
      expect(writerDoc.getMap(NAME).toJSON()).toEqual(synced);
    });

    it("keeps a peer's insert into the text the gap touched when the store edits it", () => {
      const initial = { note: "hello world", log: "seed" };
      const { writerDoc, readerDoc, store, write, deliver, peer } = gap(
        initial,
        2,
        options,
      );
      const other = peer();
      const u0 = write({ ...initial, log: "changed" });
      const u1 = write({ note: "hello there", log: "changed" });

      deliver(u1);
      deliver(other.write({ ...initial, note: "hello world!" }));
      expect(readerDoc.getMap(NAME).toJSON().note).not.toContain("world");
      expect(readerDoc.getMap(NAME).toJSON().note).toContain("!");
      store.update((state) => ({ ...state, note: "Hello world" }));
      deliver(u0);
      syncAll(writerDoc, readerDoc, other.doc);

      const synced = { note: "Hello there!", log: "changed" };
      expect(store.getState()).toEqual(synced);
      expect(writerDoc.getMap(NAME).toJSON()).toEqual(synced);
      expect(other.doc.getMap(NAME).toJSON()).toEqual(synced);
    });
  });

  it("reports no change and keeps its read and revision while the gap is open, then reports one", () => {
    const { backend, write, deliver } = gap({ text: "seed", log: "seed" });
    const onChange = vi.fn();
    backend.subscribe(onChange);
    const revision = backend.revision?.();
    const u0 = write({ text: "seed", log: "changed" });
    const u1 = write({ text: "changed", log: "changed" });

    deliver(u1);
    expect(onChange).not.toHaveBeenCalled();
    expect(backend.revision?.()).toBe(revision);
    expect(backend.read()).toEqual({ text: "seed", log: "seed" });
    deliver(u0);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(backend.revision?.()).not.toBe(revision);
    expect(backend.read()).toEqual({ text: "changed", log: "changed" });
  });

  it("holds back for a gap in another shared type, and reports once it closes", () => {
    const { writerDoc, readerDoc, backend, store, deliver } = gap({
      text: "seed",
    });
    const onChange = vi.fn();
    backend.subscribe(onChange);
    const updates: Uint8Array[] = [];
    writerDoc.on("update", (update: Uint8Array) => updates.push(update));
    writerDoc.getText("notes").insert(0, "a");
    writerDoc.getText("notes").insert(1, "b");
    const peerDoc = new Y.Doc();
    peerDoc.clientID = 3;
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(readerDoc));
    const before = Y.encodeStateVector(peerDoc);
    createYjsBackend(peerDoc, NAME).write({ text: "seed", other: 1 });

    deliver(updates[1]);
    deliver(Y.encodeStateAsUpdate(peerDoc, before));
    expect(onChange).not.toHaveBeenCalled();
    expect(store.getState()).toEqual({ text: "seed" });
    deliver(updates[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(store.getState()).toEqual({ text: "seed", other: 1 });
  });

  it.each([
    ["above", 2],
    ["below", 0],
  ])(
    "leaves a hidden key alone when the store changes another key, with the reader's client ID %s the writer's",
    (_order, readerId) => {
      const { writerDoc, readerDoc, backend, store, write, deliver } = gap(
        { text: "seed", log: "seed" },
        readerId,
      );
      const sent: Uint8Array[] = [];
      replication.onLocalUpdate(readerDoc, (update) => sent.push(update));
      const u0 = write({ text: "seed", log: "changed" });
      const u1 = write({ text: "changed", log: "changed" });

      deliver(u1);
      store.update((state) => ({ ...state, other: 1 }));
      expect(store.getState()).toEqual({ text: "seed", log: "seed", other: 1 });
      expect(readerDoc.getMap(NAME).has("text")).toBe(false);
      deliver(u0);
      sent.forEach((update) => Y.applyUpdate(writerDoc, update));

      const synced = { text: "changed", log: "changed", other: 1 };
      expect(store.getState()).toEqual(synced);
      expect(backend.read()).toEqual(synced);
      expect(writerDoc.getMap(NAME).toJSON()).toEqual(synced);
    },
  );

  it("keeps a nested key and an array item while their replacements wait", () => {
    const initial = {
      todo: { title: "seed", done: false },
      list: [1, 2, 3],
      log: 0,
    };
    const { store, write, deliver } = gap(initial);
    const u0 = write({ ...initial, log: 1 });
    const u1 = write({
      todo: { title: "changed", done: false },
      list: [1, 9, 3],
      log: 1,
    });

    deliver(u1);
    expect(store.getState()).toEqual(initial);
    deliver(u0);
    expect(store.getState()).toEqual({
      todo: { title: "changed", done: false },
      list: [1, 9, 3],
      log: 1,
    });
  });

  it("writes the store's change to a key the gap touched over what the document holds", () => {
    const initial = {
      todo: { title: "seed", done: false },
      list: [1, 2, 3],
      log: 0,
    };
    const { writerDoc, readerDoc, store, write, deliver } = gap(initial);
    const sent: Uint8Array[] = [];
    replication.onLocalUpdate(readerDoc, (update) => sent.push(update));
    const u0 = write({ ...initial, log: 1 });
    const u1 = write({
      todo: { title: "changed", done: false },
      list: [1, 9, 3],
      log: 1,
    });

    deliver(u1);
    store.update((state) => ({
      ...state,
      todo: { title: "seed", done: true },
      list: [1, 2, 3, 4],
    }));
    deliver(u0);
    sent.forEach((update) => Y.applyUpdate(writerDoc, update));

    // The store's append survives, and the item the gap replaced stays gone.
    const synced = {
      todo: { title: "changed", done: true },
      list: [1, 9, 3, 4],
      log: 1,
    };
    expect(store.getState()).toEqual(synced);
    expect(writerDoc.getMap(NAME).toJSON()).toEqual(synced);
  });
});
