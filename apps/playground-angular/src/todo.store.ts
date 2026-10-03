import { computed, DestroyRef, inject, Injector, signal } from "@angular/core";
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from "@ngrx/signals";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createNgrxSignalsAdapter } from "@homeostate/store-ngrx-signals";
import {
  connectSharedDoc,
  countTodos,
  createInitialTodoState,
  filterTodos,
  SYNC_MAP_NAME,
  type FilterStatus,
} from "@homeostate/playground/shared";
import type { DevtoolsSource } from "@homeostate/tool-devtools/mount";
import type { WebsocketProvider } from "y-websocket";
import { PLAYGROUND_CONFIG } from "./config";

export type SyncStatus =
  "connecting" | "connected" | "synced" | "unreachable" | "offline";

function readStatus(provider: WebsocketProvider): SyncStatus {
  if (!provider.shouldConnect) return "offline";
  if (provider.wsconnected) return provider.synced ? "synced" : "connected";
  return provider.wsconnecting ? "connecting" : "unreachable";
}

export const TodoStore = signalStore(
  withState(() => ({ shared: createInitialTodoState() })),
  withProps((store) => {
    const connection = connectSharedDoc(
      inject(PLAYGROUND_CONFIG).syncServerUrl,
    );
    const adapter = createNgrxSignalsAdapter(store, {
      select: (state) => state.shared,
      replace: (shared) => patchState(store, { shared }),
      injector: inject(Injector),
    });
    const backend = createYjsBackend(connection.ydoc, SYNC_MAP_NAME);
    const engine = createSyncEngine(backend, adapter);
    /** The store as the devtools panel sees it. */
    const devtoolsSource: DevtoolsSource = {
      name: "NgRx Signals todos",
      adapter,
      backend,
      engine,
      persistence: connection.persistence,
    };
    return {
      _connection: connection,
      _engine: engine,
      devtoolsSource,
      status: signal(readStatus(connection.wsProvider)),
    };
  }),
  withComputed(({ shared }) => ({
    visibleTodos: computed(() =>
      filterTodos(shared.todos(), shared.searchTerm(), shared.filterStatus()),
    ),
    counts: computed(() => countTodos(shared.todos())),
  })),
  withMethods((store) => ({
    addTodo(title: string) {
      const trimmed = title.trim();
      if (!trimmed) return;
      patchState(store, ({ shared }) => ({
        shared: {
          ...shared,
          todos: [
            ...shared.todos,
            { id: crypto.randomUUID(), title: trimmed, completed: false },
          ],
        },
      }));
    },
    toggleTodo(id: string) {
      patchState(store, ({ shared }) => ({
        shared: {
          ...shared,
          todos: shared.todos.map((todo) =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo,
          ),
        },
      }));
    },
    editTodo(id: string, title: string) {
      const trimmed = title.trim();
      if (!trimmed) return;
      patchState(store, ({ shared }) => ({
        shared: {
          ...shared,
          todos: shared.todos.map((todo) =>
            todo.id === id ? { ...todo, title: trimmed } : todo,
          ),
        },
      }));
    },
    deleteTodo(id: string) {
      patchState(store, ({ shared }) => ({
        shared: {
          ...shared,
          todos: shared.todos.filter((todo) => todo.id !== id),
        },
      }));
    },
    setSearchTerm(searchTerm: string) {
      patchState(store, ({ shared }) => ({
        shared: { ...shared, searchTerm },
      }));
    },
    setFilterStatus(filterStatus: FilterStatus) {
      patchState(store, ({ shared }) => ({
        shared: { ...shared, filterStatus },
      }));
    },
    toggleConnection() {
      const provider = store._connection.wsProvider;
      if (provider.shouldConnect) provider.disconnect();
      else provider.connect();
      store.status.set(readStatus(provider));
    },
  })),
  withHooks((store) => {
    const destroyRef = inject(DestroyRef);
    return {
      onInit() {
        const { ydoc, wsProvider } = store._connection;
        const engine = store._engine;
        const updateStatus = () => store.status.set(readStatus(wsProvider));
        wsProvider.on("status", updateStatus);
        wsProvider.on("sync", updateStatus);
        wsProvider.on("connection-close", updateStatus);
        wsProvider.on("connection-error", updateStatus);
        engine.connect();
        updateStatus();
        destroyRef.onDestroy(() => {
          engine.disconnect();
          wsProvider.off("status", updateStatus);
          wsProvider.off("sync", updateStatus);
          wsProvider.off("connection-close", updateStatus);
          wsProvider.off("connection-error", updateStatus);
          wsProvider.destroy();
          ydoc.destroy();
        });
      },
    };
  }),
);
