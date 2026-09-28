import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createStore } from "zustand/vanilla";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createZustandAdapter } from "@homeostate/store-zustand";
import {
  connectSharedDoc,
  createInitialTodoState,
  EDITOR_ROOM,
  SYNC_MAP_NAME,
  TODO_ROOM,
} from "../sync";
import type { TodoState } from "../types/todo";

// Keep the real document initialization; only replace the network boundary.
vi.mock("y-websocket", () => ({
  WebsocketProvider: class {
    constructor(
      readonly url: string,
      readonly room: string,
      readonly doc: Y.Doc,
    ) {}
    destroy() {}
  },
}));

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function openTab(clientID: number) {
  const { ydoc, wsProvider } = connectSharedDoc();
  ydoc.clientID = clientID;
  const store = createStore<TodoState>(() => createInitialTodoState());
  const engine = createSyncEngine(
    createYjsBackend(ydoc, SYNC_MAP_NAME),
    createZustandAdapter(store),
  );
  engine.connect();
  cleanups.push(() => {
    engine.disconnect();
    wsProvider.destroy();
    ydoc.destroy();
  });
  return { doc: ydoc, store };
}

function exchange(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

const edited: TodoState = {
  todos: [{ id: "1", title: "An existing edit", completed: true }],
  searchTerm: "existing",
  filterStatus: "completed",
};

describe("todo initialization", () => {
  it.each([
    [1, 2],
    [2, 1],
  ])(
    "preserves every shared field when client %i is joined by client %i",
    (firstId, joiningId) => {
      const first = openTab(firstId);
      first.store.setState(edited);
      const joining = openTab(joiningId);

      exchange(first.doc, joining.doc);

      expect(first.store.getState()).toEqual(edited);
      expect(joining.store.getState()).toEqual(edited);
      expect(first.doc.getMap(SYNC_MAP_NAME).toJSON()).toEqual(edited);
      expect(joining.doc.getMap(SYNC_MAP_NAME).toJSON()).toEqual(edited);
    },
  );

  it("starts independent tabs with one shared history for all initial fields", () => {
    const a = openTab(1);
    const b = openTab(2);
    // Equal JSON alone would miss two competing Y.Arrays or Y.Texts.
    expect(Y.encodeStateVector(a.doc)).toEqual(Y.encodeStateVector(b.doc));
    exchange(a.doc, b.doc);
    expect(a.store.getState()).toEqual(createInitialTodoState());
    expect(b.store.getState()).toEqual(createInitialTodoState());
  });

  it("does not restore a deleted initial todo when a fresh tab joins", () => {
    const first = openTab(1);
    first.store.setState({ todos: [] });
    const joining = openTab(2);
    exchange(first.doc, joining.doc);
    expect(first.store.getState().todos).toEqual([]);
    expect(joining.store.getState().todos).toEqual([]);
  });

  it("merges edits made before the tabs have ever exchanged updates", () => {
    const a = openTab(1);
    const b = openTab(2);
    a.store.setState({
      todos: [
        { ...a.store.getState().todos[0], completed: true },
        { id: "a", title: "Created offline by A", completed: false },
      ],
      searchTerm: "offline",
    });
    b.store.setState({
      todos: [
        { ...b.store.getState().todos[0], title: "Renamed offline by B" },
        { id: "b", title: "Created offline by B", completed: false },
      ],
      filterStatus: "active",
    });

    exchange(a.doc, b.doc);

    expect(a.store.getState()).toEqual(b.store.getState());
    expect(a.store.getState()).toMatchObject({
      searchTerm: "offline",
      filterStatus: "active",
    });
    expect(a.store.getState().todos).toHaveLength(3);
    expect(a.store.getState().todos).toEqual(
      expect.arrayContaining([
        { id: "1", title: "Renamed offline by B", completed: true },
        { id: "a", title: "Created offline by A", completed: false },
        { id: "b", title: "Created offline by B", completed: false },
      ]),
    );

    // Simulate another offline interval after the peers have synchronized.
    a.store.setState({ searchTerm: "reconnected" });
    b.store.setState({ filterStatus: "completed" });
    exchange(a.doc, b.doc);
    expect(a.store.getState()).toEqual(b.store.getState());
    expect(a.store.getState()).toMatchObject({
      searchTerm: "reconnected",
      filterStatus: "completed",
    });
  });

  it("does not seed todo state into the editor room", () => {
    const { ydoc, wsProvider } = connectSharedDoc(EDITOR_ROOM);
    cleanups.push(() => {
      wsProvider.destroy();
      ydoc.destroy();
    });
    expect(EDITOR_ROOM).not.toBe(TODO_ROOM);
    expect(ydoc.getMap(SYNC_MAP_NAME).toJSON()).toEqual({});
  });
});

const demos = [
  {
    name: "Zustand",
    load: async () => {
      const demo = await import("../zustand/store/useTodoStore");
      return { ...demo, read: () => demo.useTodoStore.getState() };
    },
  },
  {
    name: "Redux",
    load: async () => {
      const demo = await import("../redux/store/todoStore");
      return { ...demo, read: () => demo.store.getState() };
    },
  },
  {
    name: "MobX",
    load: async () => {
      const demo = await import("../mobx/store/TodoStore");
      return { ...demo, read: () => demo.todoStore };
    },
  },
  {
    name: "MobX-State-Tree",
    load: async () => {
      const demo = await import("../mobx-state-tree/store/TodoStore");
      return { ...demo, read: () => demo.todoStore };
    },
  },
  {
    name: "Jotai",
    load: async () => {
      const demo = await import("../jotai/store/todoAtoms");
      return { ...demo, read: () => demo.store.get(demo.todoStateAtom) };
    },
  },
  {
    name: "Valtio",
    load: async () => {
      const demo = await import("../valtio/store/todoState");
      return { ...demo, read: () => demo.todoState };
    },
  },
  {
    name: "TanStack Store",
    load: async () => {
      const demo = await import("../tanstack-store/store/todoStore");
      return { ...demo, read: () => demo.todoStore.state };
    },
  },
];

it.each(demos)(
  "$name joins with the common seed and adopts the edited room",
  async ({ load }) => {
    const room = openTab(1);
    const initialVector = Y.encodeStateVector(room.doc);
    room.store.setState(edited);
    const demo = await load();
    cleanups.push(() => {
      demo.syncEngine.disconnect();
      demo.wsProvider.destroy();
      demo.ydoc.destroy();
    });

    expect(Y.encodeStateVector(demo.ydoc)).toEqual(initialVector);
    exchange(room.doc, demo.ydoc);
    expect(demo.read()).toMatchObject(edited);
    expect(room.store.getState()).toEqual(edited);
  },
);
