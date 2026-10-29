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
import { createYjsBackend, type YjsBackendOptions } from "../index.js";

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
