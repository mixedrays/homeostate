import { createAtom, createStore } from "@tanstack/store";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createTanStackStoreAdapter } from "@homeostate/store-tanstack";
import type { DevtoolsSource } from "@homeostate/tool-devtools";
import type { FilterStatus, TodoState } from "../../types/todo";
import { countTodos, filterTodos } from "../../lib/todos";
import {
  isTodoTitle,
  SYNC_MAP_NAME,
  connectSharedDoc,
  createInitialTodoState,
} from "../../sync";

export const todoStore = createStore<TodoState, TodoActions>(
  createInitialTodoState(),
  ({ setState }) => ({
    addTodo: (title) =>
      setState((state) => ({
        ...state,
        todos: [
          ...state.todos,
          { id: crypto.randomUUID(), title, completed: false },
        ],
      })),

    toggleTodo: (id) =>
      setState((state) => ({
        ...state,
        todos: state.todos.map((todo) =>
          todo.id === id ? { ...todo, completed: !todo.completed } : todo,
        ),
      })),

    editTodo: (id, title) =>
      setState((state) => ({
        ...state,
        todos: state.todos.map((todo) =>
          todo.id === id ? { ...todo, title } : todo,
        ),
      })),

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

type TodoActions = {
  addTodo: (title: string) => void;
  toggleTodo: (id: string) => void;
  editTodo: (id: string, title: string) => void;
  deleteTodo: (id: string) => void;
  setSearchTerm: (term: string) => void;
  setFilterStatus: (status: FilterStatus) => void;
};

export const visibleTodosAtom = createAtom(() => {
  const { todos, searchTerm, filterStatus } = todoStore.state;
  return filterTodos(todos, searchTerm, filterStatus);
});

export const todoCountsAtom = createAtom(() =>
  countTodos(todoStore.state.todos),
);

const { ydoc, wsProvider, persistence, network } = connectSharedDoc();
const adapter = createTanStackStoreAdapter(todoStore);
const backend = createYjsBackend(ydoc, SYNC_MAP_NAME, { text: isTodoTitle });
const syncEngine = createSyncEngine(backend, adapter);

syncEngine.connect();

/** The store as the devtools panel sees it. */
const devtoolsSource: DevtoolsSource = {
  name: "TanStack Store todos",
  adapter,
  backend,
  engine: syncEngine,
  persistence,
  network,
};

export { devtoolsSource, syncEngine, ydoc, wsProvider };
