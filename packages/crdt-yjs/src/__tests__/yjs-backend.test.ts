import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";
import { createSyncEngine } from "@homeostate/core";
import {
  addTodo,
  createTestStore,
  deleteTodo,
  describeCrdtBackend,
  prototypeHijacks,
  renameTodo,
  threeTodos,
  todo,
  todoTitles,
  toggleTodo,
} from "@homeostate/core/conformance";
import { createYjsBackend } from "../index.js";

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

describeCrdtBackend("createYjsBackend", {
  createDoc: (id) => {
    const doc = new Y.Doc();
    if (id !== undefined) doc.clientID = id;
    return doc;
  },
  backend: (doc, options) => createYjsBackend(doc, NAME, options),
  ...replication,
  storeForeign: (doc, key, value) => {
    doc.getMap(NAME).set(key, value);
  },
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
  storeForeign: (doc, key, value) => {
    nestedMap(doc).set(key, value);
  },
});

describe("createYjsBackend", () => {
  it("deletes a middle todo without rewriting the items after it", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    backend.write(threeTodos());
    const todos = doc.getMap(NAME).get("todos") as Y.Array<Y.Map<unknown>>;
    const third = todos.get(2);

    backend.write(deleteTodo(threeTodos(), "2"));

    expect(todos.toJSON()).toEqual(deleteTodo(threeTodos(), "2").todos);
    expect(todos.get(1)).toBe(third);
  });

  it("diffs against previous instead of reading its document", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    backend.write({ count: 1, label: "a" });
    // Unreported, so a `previous` that misses it shows which side the write diffed against.
    doc.getMap(NAME).set("count", 2);

    backend.write({ count: 1, label: "b" }, { count: 1, label: "a" });

    expect(backend.read()).toEqual({ count: 2, label: "b" });
  });

  it("diffs against its document when written inside another transaction", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    backend.write({ count: 1, label: "a" });

    doc.transact(() => {
      // Reported only once the outer transaction ends, so `previous` cannot hold it yet.
      doc.getMap(NAME).set("count", 2);
      backend.write({ count: 1, label: "b" }, { count: 1, label: "a" });
    });

    expect(backend.read()).toEqual({ count: 1, label: "b" });
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
  it("exposes the synced map and the origin that tags every write", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);

    const origins = originsDuring(doc, () => {
      backend.write({ count: 1 });
      backend.write({ count: 2 });
    });

    expect(backend.map).toBe(doc.getMap(NAME));
    expect(origins).toEqual([backend.origin, backend.origin]);
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

  it("throws a TypeError for a map outside any document", () => {
    expect(() => createYjsBackend(new Y.Map())).toThrow(TypeError);
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
});

describe("untrusted key names", () => {
  it("never lets a peer's __proto__ entry reach the store", () => {
    const doc = new Y.Doc();
    const store = createTestStore({ todos: [{ id: "1" }] });
    const backend = createYjsBackend(doc, NAME);
    createSyncEngine(backend, store.adapter).connect();
    const todos = doc.getMap(NAME).get("todos") as Y.Array<Y.Map<unknown>>;
    const admin = () => new Y.Map<unknown>([["isAdmin", true]]);

    doc.transact(() => {
      todos.get(0).set("__proto__", admin());
      todos.push([
        new Y.Map<unknown>([
          ["id", "2"],
          ["__proto__", admin()],
        ]),
      ]);
    });

    expect(prototypeHijacks(backend.read())).toEqual([]);
    expect(store.getState()).toEqual({ todos: [{ id: "1" }, { id: "2" }] });
    expect(prototypeHijacks(store.getState())).toEqual([]);
  });
});

describe("strings", () => {
  const map = (doc: Y.Doc) => doc.getMap<unknown>(NAME);
  const todoMaps = (doc: Y.Doc) =>
    map(doc).get("todos") as Y.Array<Y.Map<unknown>>;

  it("stores the strings the policy marks as Y.Text and every other string as a value", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME, { text: todoTitles });
    backend.write(threeTodos());
    backend.write(addTodo(threeTodos(), todo("4")));

    expect(backend.read()).toEqual(addTodo(threeTodos(), todo("4")));
    expect(todoMaps(doc).get(3).get("title")).toBeInstanceOf(Y.Text);
    expect(todoMaps(doc).get(3).get("id")).toBe("4");
    expect(map(doc).get("filterStatus")).toBe("all");

    const onUpdate = vi.fn();
    doc.on("update", onUpdate);
    backend.write(addTodo(threeTodos(), todo("4")));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("reads strings held as Y.Text by an earlier version, and stores each as a value once it changes", () => {
    const doc = new Y.Doc();
    createYjsBackend(doc, NAME, { text: () => true }).write(threeTodos());
    const backend = createYjsBackend(doc, NAME);
    expect(backend.read()).toEqual(threeTodos());

    const next = {
      ...renameTodo(threeTodos(), "2", "Two"),
      filterStatus: "active",
    };
    backend.write(next);

    expect(backend.read()).toEqual(next);
    expect(map(doc).get("filterStatus")).toBe("active");
    expect(todoMaps(doc).get(1).get("title")).toBe("Two");
    expect(map(doc).get("searchTerm")).toBeInstanceOf(Y.Text);
    expect(todoMaps(doc).get(0).get("title")).toBeInstanceOf(Y.Text);
  });

  it("turns a plain string at a text path into a Y.Text when it next changes", () => {
    const doc = new Y.Doc();
    createYjsBackend(doc, NAME).write({ ...threeTodos(), tags: ["a"] });
    const backend = createYjsBackend(doc, NAME, {
      text: (path) => todoTitles(path) || path[0] === "tags",
    });

    const next = { ...renameTodo(threeTodos(), "2", "Todo 2!"), tags: ["ab"] };
    backend.write(next);

    expect(backend.read()).toEqual(next);
    expect(todoMaps(doc).get(1).get("title")).toBeInstanceOf(Y.Text);
    expect((map(doc).get("tags") as Y.Array<unknown>).get(0)).toBeInstanceOf(
      Y.Text,
    );
    expect(todoMaps(doc).get(0).get("title")).toBe("Todo 1");
  });
});
