import * as A from "@automerge/automerge";
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
  toggleTodo,
  type TodoState,
} from "@homeostate/core/conformance";
import {
  createAutomergeBackend,
  createAutomergeHandle,
  type AutomergeHandle,
} from "../index.js";

const NAME = "shared";

type Root = Record<string, unknown>;
type Handle = AutomergeHandle<Root>;

const actor = (id: number): string => id.toString(16).padStart(2, "0");

const createHandle = (id?: number): Handle =>
  createAutomergeHandle(
    id === undefined ? A.init<Root>() : A.init<Root>(actor(id)),
  );

describeCrdtBackend("createAutomergeBackend", {
  createDoc: createHandle,
  backend: (handle, options) => createAutomergeBackend(handle, NAME, options),
  exchange: (a, b) => {
    b.update((doc) => A.merge(doc, a.doc()));
    a.update((doc) => A.merge(doc, b.doc()));
  },
  onLocalUpdate: (handle, listener) =>
    handle.subscribe(({ doc, local }) => {
      if (local) listener(A.getLastLocalChange(doc) ?? new Uint8Array());
    }),
  storeForeign: (handle, key, value) => {
    handle.change((doc) => {
      doc[NAME] ??= {};
      (doc[NAME] as Root)[key] = value;
    });
  },
});

describe("createAutomergeBackend", () => {
  it("treats undefined the way JSON.stringify does", () => {
    const backend = createAutomergeBackend(createHandle(), NAME);

    backend.write({ a: undefined, list: [undefined, 1] });
    expect(backend.read()).toEqual({ list: [null, 1] });
    backend.write({ a: 1, b: undefined, list: [null, 1] });
    expect(backend.read()).toEqual({ a: 1, list: [null, 1] });
    backend.write({ a: undefined, list: [null, 1] });
    expect(backend.read()).toEqual({ list: [null, 1] });
  });

  it("deletes a middle todo without rewriting the items after it", () => {
    const handle = createHandle();
    const backend = createAutomergeBackend(handle, NAME);
    backend.write(threeTodos());
    const todos = () => (handle.doc()[NAME] as TodoState).todos;
    const third = A.getObjectId(todos()[2]);

    backend.write(deleteTodo(threeTodos(), "2"));

    expect(backend.read()).toEqual(deleteTodo(threeTodos(), "2"));
    expect(A.getObjectId(todos()[1])).toBe(third);
  });

  it("diffs against previous instead of reading its document", () => {
    const handle = createHandle();
    const backend = createAutomergeBackend(handle, NAME);
    backend.write({ count: 1, label: "a" });
    // Unreported, so a `previous` that misses it shows which side the write diffed against.
    handle.change((doc) => {
      (doc[NAME] as Root).count = 2;
    });

    backend.write({ count: 1, label: "b" }, { count: 1, label: "a" });

    expect(backend.read()).toEqual({ count: 2, label: "b" });
  });

  it("creates the synced key when given previous for a document without it", () => {
    const backend = createAutomergeBackend(createHandle(), NAME);
    // What the engine passes after `read()` reported the missing key as an empty object.
    backend.write({ count: 1 }, {});

    expect(backend.read()).toEqual({ count: 1 });
  });

  it("shares unchanged subtrees between reads and copies the changed path", () => {
    const backend = createAutomergeBackend(createHandle(), NAME);
    backend.write(threeTodos());
    const first = backend.read() as TodoState;

    backend.write(toggleTodo(threeTodos(), "1"));
    const second = backend.read() as TodoState;

    expect(second).toEqual(toggleTodo(threeTodos(), "1"));
    expect(first).toEqual(threeTodos());
    expect(second).not.toBe(first);
    expect(second.todos).not.toBe(first.todos);
    expect(second.todos[0]).not.toBe(first.todos[0]);
    expect(second.todos[1]).toBe(first.todos[1]);
    expect(second.todos[2]).toBe(first.todos[2]);
    expect(Object.getOwnPropertySymbols(second.todos[0])).toEqual([]);
    expect(backend.read()).toBe(second);
  });
});

describe("untrusted key names", () => {
  it("never lets a peer's __proto__ entry reach the store", () => {
    const handle = createHandle();
    const store = createTestStore({ todos: [{ id: "1" }] });
    const backend = createAutomergeBackend(handle, NAME);
    createSyncEngine(backend, store.adapter).connect();

    // Automerge stores the key; its document proxies leave it out of Object.keys.
    handle.update((doc) =>
      A.change(doc, (draft) => {
        (draft[NAME] as { todos: unknown[] }).todos.push(
          JSON.parse('{"id":"2","__proto__":{"isAdmin":true}}'),
        );
      }),
    );

    expect(prototypeHijacks(backend.read())).toEqual([]);
    expect(store.getState()).toEqual({ todos: [{ id: "1" }, { id: "2" }] });
    expect(prototypeHijacks(store.getState())).toEqual([]);
  });
});

describe("strings", () => {
  type Stored = Record<string, unknown> & {
    todos: Record<string, unknown>[];
    tags: unknown[];
  };
  const stored = (handle: Handle) => handle.doc()[NAME] as Stored;

  it("stores the strings the policy marks as text and every other string as an ImmutableString", () => {
    const handle = createHandle();
    const backend = createAutomergeBackend(handle, NAME, { text: todoTitles });
    backend.write(threeTodos());
    backend.write(addTodo(threeTodos(), todo("4")));

    expect(backend.read()).toEqual(addTodo(threeTodos(), todo("4")));
    expect(stored(handle).todos[3].title).toBe("Todo 4");
    expect(A.isImmutableString(stored(handle).todos[3].id)).toBe(true);
    expect(A.isImmutableString(stored(handle).filterStatus)).toBe(true);

    const heads = A.getHeads(handle.doc());
    backend.write(addTodo(threeTodos(), todo("4")));
    expect(A.getHeads(handle.doc())).toEqual(heads);
  });

  it("reads strings held as text by an earlier version, and stores each as an ImmutableString once it changes", () => {
    const handle = createHandle();
    createAutomergeBackend(handle, NAME, { text: () => true }).write(
      threeTodos(),
    );
    const backend = createAutomergeBackend(handle, NAME);
    expect(backend.read()).toEqual(threeTodos());

    const next = {
      ...renameTodo(threeTodos(), "2", "Two"),
      filterStatus: "active",
    };
    backend.write(next);

    expect(backend.read()).toEqual(next);
    expect(A.isImmutableString(stored(handle).filterStatus)).toBe(true);
    expect(A.isImmutableString(stored(handle).todos[1].title)).toBe(true);
    expect(stored(handle).searchTerm).toBe("");
    expect(stored(handle).todos[0].title).toBe("Todo 1");
  });

  it("turns an ImmutableString at a text path into text when it next changes", () => {
    const handle = createHandle();
    createAutomergeBackend(handle, NAME).write({
      ...threeTodos(),
      tags: ["a"],
    });
    const backend = createAutomergeBackend(handle, NAME, {
      text: (path) => todoTitles(path) || path[0] === "tags",
    });

    const next = { ...renameTodo(threeTodos(), "2", "Todo 2!"), tags: ["ab"] };
    backend.write(next);

    expect(backend.read()).toEqual(next);
    expect(stored(handle).todos[1].title).toBe("Todo 2!");
    expect(stored(handle).tags[0]).toBe("ab");
    expect(A.isImmutableString(stored(handle).todos[0].title)).toBe(true);
  });
});
