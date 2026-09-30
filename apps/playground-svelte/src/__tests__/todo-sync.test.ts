import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createStore } from "zustand/vanilla";
import { createZustandAdapter } from "@homeostate/store-zustand";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import {
  connectSharedDoc,
  createInitialTodoState,
  SYNC_MAP_NAME,
  type TodoState,
} from "@homeostate/playground/shared";
import { createTodoStore } from "../todo.store";

const providers = vi.hoisted(
  () => [] as { doc: Y.Doc; shouldConnect: boolean; destroy: () => void }[],
);
vi.mock("y-websocket", () => ({
  WebsocketProvider: class {
    shouldConnect = true;
    wsconnected = true;
    synced = true;
    on = vi.fn();
    off = vi.fn();
    destroy = vi.fn();
    constructor(
      _url: string,
      _room: string,
      readonly doc: Y.Doc,
    ) {
      providers.push(this);
    }
    connect() {
      this.shouldConnect = true;
    }
    disconnect() {
      this.shouldConnect = false;
    }
  },
}));

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  providers.splice(0);
});

function openSvelte() {
  const todos = createTodoStore("ws://localhost:9999");
  const provider = providers[providers.length - 1];
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    todos.destroy();
  };
  cleanups.push(destroy);
  return { ...todos, doc: provider.doc, provider, destroy };
}

function openReact() {
  const { ydoc, wsProvider } = connectSharedDoc("ws://localhost:9999");
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
  return { store, doc: ydoc };
}

function exchange(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

describe("Svelte playground", () => {
  it("joins the React room with identical CRDT history and preserves previous edits", () => {
    const react = openReact();
    const seed = Y.encodeStateVector(react.doc);
    react.store.setState({
      todos: [],
      searchTerm: "existing",
      filterStatus: "completed",
    });
    const svelte = openSvelte();
    expect(Y.encodeStateVector(svelte.doc)).toEqual(seed);
    exchange(react.doc, svelte.doc);
    expect(svelte.store.state).toEqual(react.store.getState());
    expect(svelte.store.state.todos).toEqual([]);
  });

  it("syncs add, edit, complete, delete, search and filters in both directions", () => {
    const svelte = openSvelte();
    const react = openReact();
    const { actions } = svelte.store;
    actions.addTodo("  Svelte task  ");
    const id = svelte.store.state.todos[1].id;
    exchange(svelte.doc, react.doc);
    expect(react.store.getState().todos[1].title).toBe("Svelte task");
    actions.editTodo(id, "Edited in Svelte");
    actions.toggleTodo(id);
    actions.setSearchTerm("edited");
    actions.setFilterStatus("completed");
    exchange(svelte.doc, react.doc);
    expect(react.store.getState()).toEqual(svelte.store.state);
    expect(svelte.visibleTodos.get()).toEqual([
      { id, title: "Edited in Svelte", completed: true },
    ]);
    react.store.setState({ searchTerm: "", filterStatus: "all" });
    exchange(react.doc, svelte.doc);
    expect(svelte.visibleTodos.get()).toHaveLength(2);
    expect(svelte.counts.get()).toEqual({ all: 2, active: 1, completed: 1 });
    actions.deleteTodo(id);
    exchange(svelte.doc, react.doc);
    expect(react.store.getState().todos).toHaveLength(1);
  });

  it("merges independent offline edits with the React demo after reconnecting", () => {
    const svelte = openSvelte();
    const react = openReact();
    exchange(svelte.doc, react.doc);
    svelte.toggleConnection();
    expect(svelte.status.get()).toBe("offline");
    svelte.store.actions.toggleTodo("1");
    svelte.store.actions.addTodo("Created offline");
    react.store.setState({
      todos: [{ id: "1", title: "Renamed in React", completed: false }],
    });
    svelte.toggleConnection();
    exchange(react.doc, svelte.doc);
    expect(svelte.status.get()).toBe("synced");
    expect(svelte.store.state).toEqual(react.store.getState());
    expect(svelte.store.state.todos[0]).toEqual({
      id: "1",
      title: "Renamed in React",
      completed: true,
    });
    expect(svelte.store.state.todos).toHaveLength(2);
  });

  it("rejects blank titles and destroys network/document resources on teardown", () => {
    const { store, doc, provider, destroy } = openSvelte();
    store.actions.addTodo("   ");
    store.actions.editTodo("1", "   ");
    expect(store.state).toEqual(createInitialTodoState());
    const destroyDoc = vi.spyOn(doc, "destroy");
    destroy();
    expect(provider.destroy).toHaveBeenCalledOnce();
    expect(destroyDoc).toHaveBeenCalledOnce();
    const snapshot = doc.getMap(SYNC_MAP_NAME).toJSON();
    store.actions.addTodo("After teardown");
    expect(doc.getMap(SYNC_MAP_NAME).toJSON()).toEqual(snapshot);
  });
});
