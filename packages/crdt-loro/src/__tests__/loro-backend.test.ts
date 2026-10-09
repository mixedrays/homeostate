import { LoroDoc, LoroMap, LoroText, type LoroList } from "loro-crdt";
import { describe, expect, it } from "vitest";
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
import { createLoroBackend } from "../index.js";

const NAME = "shared";

describeCrdtBackend("createLoroBackend", {
  createDoc: (id) => {
    const doc = new LoroDoc();
    if (id !== undefined) doc.setPeerId(id);
    return doc;
  },
  backend: (doc, options) => createLoroBackend(doc, NAME, options),
  exchange: (a, b) => {
    b.import(a.export({ mode: "update", from: b.version() }));
    a.import(b.export({ mode: "update", from: a.version() }));
  },
  onLocalUpdate: (doc, listener) => doc.subscribeLocalUpdates(listener),
  storeForeign: (doc, key, value) => {
    doc.getMap(NAME).set(key, value);
    doc.commit();
  },
});

describe("createLoroBackend", () => {
  it("deletes a middle todo without rewriting the items after it", () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);
    backend.write(threeTodos());
    const todos = doc.getMap(NAME).get("todos") as LoroList;
    const third = (todos.get(2) as LoroMap).id;

    backend.write(deleteTodo(threeTodos(), "2"));

    expect(todos.toJSON()).toEqual(deleteTodo(threeTodos(), "2").todos);
    expect((todos.get(1) as LoroMap).id).toBe(third);
  });

  it("diffs against previous instead of reading its document", () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);
    backend.write({ count: 1, label: "a" });
    // Unreported, so a `previous` that misses it shows which side the write diffed against.
    doc.getMap(NAME).set("count", 2);
    doc.commit();

    backend.write({ count: 1, label: "b" }, { count: 1, label: "a" });

    expect(backend.read()).toEqual({ count: 2, label: "b" });
  });

  it("diffs against its document while edits by other code are uncommitted", () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);
    backend.write({ count: 1, label: "a" });
    // Reported only once committed, so `previous` cannot hold it yet.
    doc.getMap(NAME).set("count", 2);

    backend.write({ count: 1, label: "b" }, { count: 1, label: "a" });

    expect(backend.read()).toEqual({ count: 1, label: "b" });
  });
});

describe("untrusted key names", () => {
  it("never lets a peer's __proto__ entry reach the store", () => {
    const doc = new LoroDoc();
    const store = createTestStore({ todos: [{ id: "1" }] });
    const backend = createLoroBackend(doc, NAME);
    createSyncEngine(backend, store.adapter).connect();
    const todos = doc.getMap(NAME).get("todos") as LoroList;

    (todos.get(0) as LoroMap)
      .setContainer("__proto__", new LoroMap())
      .set("isAdmin", true);
    const added = todos.insertContainer(1, new LoroMap());
    added.set("id", "2");
    added.setContainer("__proto__", new LoroMap()).set("isAdmin", true);
    doc.commit();

    expect(prototypeHijacks(backend.read())).toEqual([]);
    expect(store.getState()).toEqual({ todos: [{ id: "1" }, { id: "2" }] });
    expect(prototypeHijacks(store.getState())).toEqual([]);
  });
});

describe("strings", () => {
  const map = (doc: LoroDoc) => doc.getMap(NAME);
  const todoMap = (doc: LoroDoc, index: number) =>
    (map(doc).get("todos") as LoroList).get(index) as LoroMap;

  it("stores the strings the policy marks as LoroText and every other string as a value", () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME, { text: todoTitles });
    backend.write(threeTodos());
    backend.write(addTodo(threeTodos(), todo("4")));

    expect(backend.read()).toEqual(addTodo(threeTodos(), todo("4")));
    expect(todoMap(doc, 3).get("title")).toBeInstanceOf(LoroText);
    expect(todoMap(doc, 3).get("id")).toBe("4");
    expect(map(doc).get("filterStatus")).toBe("all");

    const version = doc.oplogVersion();
    backend.write(addTodo(threeTodos(), todo("4")));
    expect(doc.oplogVersion().compare(version)).toBe(0);
  });

  it("reads strings held as LoroText by an earlier version, and stores each as a value once it changes", () => {
    const doc = new LoroDoc();
    createLoroBackend(doc, NAME, { text: () => true }).write(threeTodos());
    const backend = createLoroBackend(doc, NAME);
    expect(backend.read()).toEqual(threeTodos());

    const next = {
      ...renameTodo(threeTodos(), "2", "Two"),
      filterStatus: "active",
    };
    backend.write(next);

    expect(backend.read()).toEqual(next);
    expect(map(doc).get("filterStatus")).toBe("active");
    expect(todoMap(doc, 1).get("title")).toBe("Two");
    expect(map(doc).get("searchTerm")).toBeInstanceOf(LoroText);
    expect(todoMap(doc, 0).get("title")).toBeInstanceOf(LoroText);
  });

  it("turns a plain string at a text path into a LoroText when it next changes", () => {
    const doc = new LoroDoc();
    createLoroBackend(doc, NAME).write({ ...threeTodos(), tags: ["a"] });
    const backend = createLoroBackend(doc, NAME, {
      text: (path) => todoTitles(path) || path[0] === "tags",
    });

    const next = { ...renameTodo(threeTodos(), "2", "Todo 2!"), tags: ["ab"] };
    backend.write(next);

    expect(backend.read()).toEqual(next);
    expect(todoMap(doc, 1).get("title")).toBeInstanceOf(LoroText);
    expect((map(doc).get("tags") as LoroList).get(0)).toBeInstanceOf(LoroText);
    expect(todoMap(doc, 0).get("title")).toBe("Todo 1");
  });
});
