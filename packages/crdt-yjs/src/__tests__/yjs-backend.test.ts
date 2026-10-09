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
} from "@homeostate/core/conformance";
import { createYjsBackend } from "../index.js";

const NAME = "shared";

describeCrdtBackend("createYjsBackend", {
  createDoc: (id) => {
    const doc = new Y.Doc();
    if (id !== undefined) doc.clientID = id;
    return doc;
  },
  backend: (doc, options) => createYjsBackend(doc, NAME, options),
  exchange: (a, b) => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  },
  onLocalUpdate: (doc, listener) => {
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
  storeForeign: (doc, key, value) => {
    doc.getMap(NAME).set(key, value);
  },
  knownFailures: {
    "keeps the document when a read of a foreign value is mutated":
      "read() returns plain values other code stored by reference (task 073)",
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
