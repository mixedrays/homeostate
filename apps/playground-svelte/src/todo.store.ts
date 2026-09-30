import { createAtom, createStore } from "@tanstack/store";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createTanStackStoreAdapter } from "@homeostate/store-tanstack";
import {
  connectSharedDoc,
  countTodos,
  createInitialTodoState,
  filterTodos,
  SYNC_MAP_NAME,
  type FilterStatus,
  type TodoState,
} from "@homeostate/playground/shared";
import type { WebsocketProvider } from "y-websocket";

export type SyncStatus =
  "connecting" | "connected" | "synced" | "unreachable" | "offline";

type TodoActions = {
  addTodo: (title: string) => void;
  toggleTodo: (id: string) => void;
  editTodo: (id: string, title: string) => void;
  deleteTodo: (id: string) => void;
  setSearchTerm: (term: string) => void;
  setFilterStatus: (status: FilterStatus) => void;
};

function readStatus(provider: WebsocketProvider): SyncStatus {
  if (!provider.shouldConnect) return "offline";
  if (provider.wsconnected) return provider.synced ? "synced" : "connected";
  return provider.wsconnecting ? "connecting" : "unreachable";
}

/**
 * A todo store synced into the shared room. The caller owns it and must call `destroy`
 * on teardown, which also closes the connection and the document.
 */
export function createTodoStore(syncServerUrl: string) {
  const store = createStore<TodoState, TodoActions>(
    createInitialTodoState(),
    ({ setState }) => ({
      addTodo: (title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        setState((state) => ({
          ...state,
          todos: [
            ...state.todos,
            { id: crypto.randomUUID(), title: trimmed, completed: false },
          ],
        }));
      },

      toggleTodo: (id) =>
        setState((state) => ({
          ...state,
          todos: state.todos.map((todo) =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo,
          ),
        })),

      editTodo: (id, title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        setState((state) => ({
          ...state,
          todos: state.todos.map((todo) =>
            todo.id === id ? { ...todo, title: trimmed } : todo,
          ),
        }));
      },

      deleteTodo: (id) =>
        setState((state) => ({
          ...state,
          todos: state.todos.filter((todo) => todo.id !== id),
        })),

      setSearchTerm: (searchTerm) =>
        setState((state) => ({ ...state, searchTerm })),
      setFilterStatus: (filterStatus) =>
        setState((state) => ({ ...state, filterStatus })),
    }),
  );

  const visibleTodos = createAtom(() => {
    const { todos, searchTerm, filterStatus } = store.state;
    return filterTodos(todos, searchTerm, filterStatus);
  });
  const counts = createAtom(() => countTodos(store.state.todos));

  const { ydoc, wsProvider } = connectSharedDoc(syncServerUrl);
  const engine = createSyncEngine(
    createYjsBackend(ydoc, SYNC_MAP_NAME),
    createTanStackStoreAdapter(store),
  );

  const status = createAtom<SyncStatus>(readStatus(wsProvider));
  const updateStatus = () => status.set(readStatus(wsProvider));
  wsProvider.on("status", updateStatus);
  wsProvider.on("sync", updateStatus);
  wsProvider.on("connection-close", updateStatus);
  wsProvider.on("connection-error", updateStatus);
  engine.connect();
  updateStatus();

  return {
    store,
    visibleTodos,
    counts,
    status,
    toggleConnection() {
      if (wsProvider.shouldConnect) wsProvider.disconnect();
      else wsProvider.connect();
      updateStatus();
    },
    destroy() {
      engine.disconnect();
      wsProvider.off("status", updateStatus);
      wsProvider.off("sync", updateStatus);
      wsProvider.off("connection-close", updateStatus);
      wsProvider.off("connection-error", updateStatus);
      wsProvider.destroy();
      ydoc.destroy();
    },
  };
}
