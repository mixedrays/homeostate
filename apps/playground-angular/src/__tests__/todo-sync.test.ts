import "@angular/compiler";
import { Injector } from "@angular/core";
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
} from "@homeostate/playground-shared";
import { PLAYGROUND_CONFIG } from "../config";
import { TodoStore } from "../todo.store";

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

function openAngular() {
  const injector = Injector.create({
    providers: [
      TodoStore,
      {
        provide: PLAYGROUND_CONFIG,
        useValue: {
          syncServerUrl: "ws://localhost:9999",
          playgroundUrl: "http://localhost:5173/todo",
        },
      },
    ],
  });
  const store = injector.get(TodoStore);
  const provider = providers[providers.length - 1];
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    injector.destroy();
  };
  cleanups.push(destroy);
  return { store, doc: provider.doc, provider, destroy };
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

describe("Angular playground", () => {
  it("joins the React room with identical CRDT history and preserves previous edits", () => {
    const react = openReact();
    const seed = Y.encodeStateVector(react.doc);
    react.store.setState({
      todos: [],
      searchTerm: "existing",
      filterStatus: "completed",
    });
    const angular = openAngular();
    expect(Y.encodeStateVector(angular.doc)).toEqual(seed);
    exchange(react.doc, angular.doc);
    expect(angular.store.shared()).toEqual(react.store.getState());
    expect(angular.store.shared.todos()).toEqual([]);
  });

  it("syncs add, edit, complete, delete, search and filters in both directions", () => {
    const angular = openAngular();
    const react = openReact();
    angular.store.addTodo("  Angular task  ");
    const id = angular.store.shared.todos()[1].id;
    exchange(angular.doc, react.doc);
    expect(react.store.getState().todos[1].title).toBe("Angular task");
    angular.store.editTodo(id, "Edited in Angular");
    angular.store.toggleTodo(id);
    angular.store.setSearchTerm("edited");
    angular.store.setFilterStatus("completed");
    exchange(angular.doc, react.doc);
    expect(react.store.getState()).toEqual(angular.store.shared());
    expect(angular.store.visibleTodos()).toEqual([
      { id, title: "Edited in Angular", completed: true },
    ]);
    react.store.setState({ searchTerm: "", filterStatus: "all" });
    exchange(react.doc, angular.doc);
    expect(angular.store.visibleTodos()).toHaveLength(2);
    angular.store.deleteTodo(id);
    exchange(angular.doc, react.doc);
    expect(react.store.getState().todos).toHaveLength(1);
  });

  it("merges independent offline edits with the React demo after reconnecting", () => {
    const angular = openAngular();
    const react = openReact();
    exchange(angular.doc, react.doc);
    angular.store.toggleConnection();
    expect(angular.store.status()).toBe("offline");
    angular.store.toggleTodo("1");
    angular.store.addTodo("Created offline");
    react.store.setState({
      todos: [{ id: "1", title: "Renamed in React", completed: false }],
    });
    angular.store.toggleConnection();
    exchange(react.doc, angular.doc);
    expect(angular.store.status()).toBe("synced");
    expect(angular.store.shared()).toEqual(react.store.getState());
    expect(angular.store.shared.todos()[0]).toEqual({
      id: "1",
      title: "Renamed in React",
      completed: true,
    });
    expect(angular.store.shared.todos()).toHaveLength(2);
  });

  it("rejects blank titles and destroys network/document resources with its injector", () => {
    const { store, doc, provider, destroy } = openAngular();
    store.addTodo("   ");
    store.editTodo("1", "   ");
    expect(store.shared()).toEqual(createInitialTodoState());
    const destroyDoc = vi.spyOn(doc, "destroy");
    destroy();
    expect(provider.destroy).toHaveBeenCalledOnce();
    expect(destroyDoc).toHaveBeenCalledOnce();
    const snapshot = doc.getMap(SYNC_MAP_NAME).toJSON();
    store.addTodo("After teardown");
    expect(doc.getMap(SYNC_MAP_NAME).toJSON()).toEqual(snapshot);
  });
});
