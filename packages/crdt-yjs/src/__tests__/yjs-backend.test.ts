import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";
import { createSyncEngine, type SyncEngineConfig } from "@homeostate/core";
import { createYjsBackend, type YjsBackendOptions } from "../index.js";
import {
  addTodo,
  concurrentReplacements,
  createTestStore,
  deleteTodo,
  expectOneWrittenValue,
  manyTodos,
  renameTodo,
  setSearchTerm,
  snapshot,
  threeTodos,
  todo,
  todoTitles,
  toggleTodo,
  type TodoState,
  nonJsonWrites,
  prototypeHijacks,
  prototypeMemberKeys,
  unicodeEdits,
} from "../../../core/src/__tests__/helpers.js";

const NAME = "shared";

const createPeer = <S extends object>(
  doc: Y.Doc,
  initial: S,
  config?: SyncEngineConfig,
  options?: YjsBackendOptions,
) => {
  const store = createTestStore(initial);
  const backend = createYjsBackend(doc, NAME, options);
  const engine = createSyncEngine(backend, store.adapter, config);
  engine.connect();
  return { doc, store, backend, engine };
};

const exchange = (a: Y.Doc, b: Y.Doc): void => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
};

const link = (a: Y.Doc, b: Y.Doc): void => {
  const relay = Symbol("relay");
  a.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== relay) Y.applyUpdate(b, update, relay);
  });
  b.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== relay) Y.applyUpdate(a, update, relay);
  });
};

const twoSyncedPeers = (
  initial: () => TodoState = threeTodos,
  idA = 1,
  idB = 2,
  options?: YjsBackendOptions,
) => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  docA.clientID = idA;
  docB.clientID = idB;
  const a = createPeer(docA, initial(), undefined, options);
  exchange(docA, docB);
  const b = createPeer(docB, initial(), undefined, options);
  return { a, b };
};

const searchTermText: YjsBackendOptions = {
  text: (path) => path[0] === "searchTerm",
};

describe("createYjsBackend", () => {
  it("ignores its own writes and reports remote transactions", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    const onRemoteChange = vi.fn();
    backend.subscribe(onRemoteChange);

    backend.write({ count: 1, label: "one" });
    expect(onRemoteChange).not.toHaveBeenCalled();
    expect(backend.read()).toEqual({ count: 1, label: "one" });

    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
    other.getMap(NAME).set("count", 2);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other, Y.encodeStateVector(doc)));
    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual({ count: 2, label: "one" });
  });

  it.each([
    [{ list: [1, 2, 3] }, { list: [0, 1] }],
    [{ list: [2, 3] }, { list: [1, 2, 3, 4] }],
    [{ list: [1, 2] }, { list: [] }],
    [
      {
        list: [
          { id: "1", done: false },
          { id: "2", done: false },
        ],
      },
      {
        list: [
          { id: "0", done: false },
          { id: "1", done: false },
          { id: "2", done: true },
        ],
      },
    ],
    [
      { list: [{ id: "1" }, { id: "2" }, { id: "3" }] },
      { list: [{ id: "1" }, { id: "3" }] },
    ],
    [
      { v: { a: 1 }, s: "a" },
      { v: [1], s: 1 },
    ],
    [{ v: "a" }, { v: { b: "c" } }],
  ])("writes %j -> %j so that read() matches", (before, after) => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);

    backend.write(before);
    expect(backend.read()).toEqual(before);
    backend.write(after);
    expect(backend.read()).toEqual(after);
  });

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

  it("stops notifying after unsubscribe", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    const onRemoteChange = vi.fn();
    const unsubscribe = backend.subscribe(onRemoteChange);

    unsubscribe();
    doc.getMap(NAME).set("count", 1);

    expect(onRemoteChange).not.toHaveBeenCalled();
  });
});

describe("two peers over Yjs", () => {
  it("keeps a toggle on A and an add on B", () => {
    const { a, b } = twoSyncedPeers();

    a.store.update((s) => toggleTodo(s, "1"));
    b.store.update((s) => addTodo(s, todo("4")));
    exchange(a.doc, b.doc);

    const expected = addTodo(toggleTodo(threeTodos(), "1"), todo("4"));
    expect(a.store.getState()).toEqual(expected);
    expect(b.store.getState()).toEqual(expected);
  });

  it.each([
    [1, 2],
    [2, 1],
  ])(
    "keeps a delete of t2 on A and a toggle of t3 on B (clientIDs %i and %i)",
    (idA, idB) => {
      const { a, b } = twoSyncedPeers(threeTodos, idA, idB);

      a.store.update((s) => deleteTodo(s, "2"));
      b.store.update((s) => toggleTodo(s, "3"));
      exchange(a.doc, b.doc);

      const expected = toggleTodo(deleteTodo(threeTodos(), "2"), "3");
      expect(a.store.getState()).toEqual(expected);
      expect(b.store.getState()).toEqual(expected);
    },
  );

  it("keeps typed search text on A and a toggle on B", () => {
    const { a, b } = twoSyncedPeers();

    for (const term of ["a", "ab", "abc"])
      a.store.update((s) => setSearchTerm(s, term));
    b.store.update((s) => toggleTodo(s, "2"));
    exchange(a.doc, b.doc);

    const expected = toggleTodo(setSearchTerm(threeTodos(), "abc"), "2");
    expect(a.store.getState()).toEqual(expected);
    expect(b.store.getState()).toEqual(expected);
  });

  it("merges concurrent renames of the same todo character-wise", () => {
    const { a, b } = twoSyncedPeers(threeTodos, 1, 2, { text: todoTitles });

    a.store.update((s) => renameTodo(s, "1", "Todo 1 A"));
    b.store.update((s) => renameTodo(s, "1", "B Todo 1"));
    exchange(a.doc, b.doc);

    expect(a.store.getState().todos[0].title).toBe("B Todo 1 A");
    expect(b.store.getState().todos[0].title).toBe("B Todo 1 A");
  });

  it("gives the receiver new containers along the changed path only", () => {
    const { a, b } = twoSyncedPeers();
    const before = b.store.getState();
    const beforeSnapshot = snapshot(before);

    a.store.update((s) => toggleTodo(s, "1"));
    exchange(a.doc, b.doc);

    const after = b.store.getState();
    expect(after).toEqual(toggleTodo(threeTodos(), "1"));
    expect(after).not.toBe(before);
    expect(after.todos).not.toBe(before.todos);
    expect(after.todos[0]).not.toBe(before.todos[0]);
    expect(after.todos[1]).toBe(before.todos[1]);
    expect(after.todos[2]).toBe(before.todos[2]);
    expect(before).toEqual(beforeSnapshot);
  });

  it.each([
    [1, 2],
    [2, 1],
  ])(
    "late joiner adopts existing todos without wiping them (clientIDs %i and %i)",
    (idA, idB) => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();
      docA.clientID = idA;
      docB.clientID = idB;
      const a = createPeer(docA, threeTodos());
      exchange(docA, docB);

      const b = createPeer(docB, {
        ...threeTodos(),
        todos: [todo("local", "Local sample")],
      });
      expect(b.store.getState()).toEqual(threeTodos());

      exchange(docA, docB);
      expect(a.store.getState()).toEqual(threeTodos());
      expect(b.store.getState()).toEqual(threeTodos());
      expect(a.backend.read()).toEqual(threeTodos());
    },
  );

  it("sends one small update per toggle, add, keystroke, and middle delete with 50 todos", () => {
    const { a, b } = twoSyncedPeers(() => manyTodos(50));
    link(a.doc, b.doc);
    const sizes: number[] = [];
    a.doc.on("update", (update: Uint8Array) => {
      sizes.push(update.byteLength);
    });

    a.store.update((s) => toggleTodo(s, "25"));
    expect(sizes).toHaveLength(1);
    a.store.update((s) => addTodo(s, todo("51")));
    expect(sizes).toHaveLength(2);
    a.store.update((s) => setSearchTerm(s, "x"));
    expect(sizes).toHaveLength(3);
    a.store.update((s) => deleteTodo(s, "10"));
    expect(sizes).toHaveLength(4);

    expect(sizes.every((size) => size < 200)).toBe(true);
    expect(b.store.getState()).toEqual(a.store.getState());
  });
});

describe("values JSON cannot hold", () => {
  it.each(nonJsonWrites)(
    "writes %s as JSON would, and rewrites it without an update",
    (_, before, next, expected) => {
      const doc = new Y.Doc();
      const backend = createYjsBackend(doc, NAME);
      backend.write(before);

      expect(() => backend.write(next)).not.toThrow();
      expect(backend.read()).toEqual(expected);

      const onUpdate = vi.fn();
      doc.on("update", onUpdate);
      backend.write(next);
      expect(onUpdate).not.toHaveBeenCalled();
    },
  );

  it("leaves object entries holding undefined out on the writer and on peers", () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    backend.write({ a: 1, b: 1, nested: { c: 1, d: 1 } });

    backend.write({ a: undefined, b: 1, nested: { c: undefined, d: 1 } });

    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    for (const read of [backend.read(), createYjsBackend(peer, NAME).read()]) {
      const state = read as { nested: object };
      expect(Object.keys(state)).toEqual(["b", "nested"]);
      expect(Object.keys(state.nested)).toEqual(["d"]);
    }
  });
});

describe("untrusted key names", () => {
  it.each(prototypeMemberKeys)(
    "replicates adding and deleting a %s key",
    (key) => {
      const initial = () => ({ byName: { bob: 1 } as Record<string, number> });
      const docA = new Y.Doc();
      const docB = new Y.Doc();
      const a = createPeer(docA, initial());
      exchange(docA, docB);
      const b = createPeer(docB, initial());

      a.store.setState({ byName: { bob: 1, [key]: 2 } });
      exchange(docA, docB);
      expect(b.store.getState().byName[key]).toBe(2);

      a.store.setState({ byName: { bob: 1 } });
      exchange(docA, docB);
      const written = a.backend.read() as { byName: object };
      expect(Object.keys(written.byName)).toEqual(["bob"]);
      expect(Object.keys(b.store.getState().byName)).toEqual(["bob"]);
    },
  );

  it("never lets a peer's __proto__ entry reach the store", () => {
    const doc = new Y.Doc();
    const { store, backend } = createPeer(doc, { todos: [{ id: "1" }] });
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

describe("Unicode replication", () => {
  it.each(unicodeEdits)(
    "replicates %j to %j through both stores",
    (before, after) => {
      const initial = () => {
        const state = threeTodos();
        state.todos[0].title = before;
        state.searchTerm = before;
        return state;
      };
      // Titles are Y.Texts and the search term a plain value, so both kinds round-trip.
      const { a, b } = twoSyncedPeers(initial, 1, 2, { text: todoTitles });
      try {
        a.store.update((state) => ({
          ...renameTodo(state, "1", after),
          searchTerm: after,
        }));
        const expected = {
          ...renameTodo(initial(), "1", after),
          searchTerm: after,
        };
        expect(a.backend.read()).toEqual(expected);
        exchange(a.doc, b.doc);
        expect(b.backend.read()).toEqual(expected);
        expect(a.store.getState()).toEqual(expected);
        expect(b.store.getState()).toEqual(expected);
      } finally {
        a.engine.disconnect();
        b.engine.disconnect();
      }
    },
  );

  it("merges an emoji replacement with a peer's surrounding text edits", () => {
    const { a, b } = twoSyncedPeers(
      () => ({ ...threeTodos(), searchTerm: "a😀b" }),
      1,
      2,
      searchTermText,
    );
    try {
      a.store.update((state) => setSearchTerm(state, "a😃b"));
      b.store.update((state) => setSearchTerm(state, "prefix a😀b suffix"));
      exchange(a.doc, b.doc);
      expect(a.store.getState().searchTerm).toBe("prefix a😃b suffix");
      expect(b.store.getState()).toEqual(a.store.getState());
      expect(a.backend.read()).toEqual(b.backend.read());
    } finally {
      a.engine.disconnect();
      b.engine.disconnect();
    }
  });
});

describe("strings", () => {
  const map = (doc: Y.Doc) => doc.getMap<unknown>(NAME);
  const todoMaps = (doc: Y.Doc) =>
    map(doc).get("todos") as Y.Array<Y.Map<unknown>>;

  it.each([
    [1, 2],
    [2, 1],
  ])(
    "keeps one written value of short strings replaced at once (clientIDs %i and %i)",
    (idA, idB) => {
      const { before, a, b } = concurrentReplacements;
      const docA = new Y.Doc();
      const docB = new Y.Doc();
      docA.clientID = idA;
      docB.clientID = idB;
      const backendA = createYjsBackend(docA, NAME);
      backendA.write(before);
      exchange(docA, docB);
      const backendB = createYjsBackend(docB, NAME);

      backendA.write(a);
      backendB.write(b);
      exchange(docA, docB);

      expectOneWrittenValue(backendA.read());
      expect(backendB.read()).toEqual(backendA.read());
    },
  );

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
