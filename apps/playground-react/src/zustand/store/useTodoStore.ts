import { create } from "zustand";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createZustandAdapter } from "@homeostate/store-zustand";
import type { DevtoolsSource } from "@homeostate/tool-devtools";
import type { FilterStatus, TodoState } from "../../types/todo";
import {
  isTodoTitle,
  SYNC_MAP_NAME,
  connectSharedDoc,
  createInitialTodoState,
} from "../../sync";

interface TodoStore extends TodoState {
  addTodo: (title: string) => void;
  toggleTodo: (id: string) => void;
  editTodo: (id: string, title: string) => void;
  deleteTodo: (id: string) => void;
  setSearchTerm: (term: string) => void;
  setFilterStatus: (status: FilterStatus) => void;
}

const initialState = createInitialTodoState();

export const useTodoStore = create<TodoStore>((set) => ({
  ...initialState,

  addTodo: (title) =>
    set((state) => ({
      todos: [
        ...state.todos,
        { id: crypto.randomUUID(), title, completed: false },
      ],
    })),

  toggleTodo: (id) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    })),

  editTodo: (id, title) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, title } : todo,
      ),
    })),

  deleteTodo: (id) =>
    set((state) => ({
      todos: state.todos.filter((todo) => todo.id !== id),
    })),

  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setFilterStatus: (filterStatus) => set({ filterStatus }),
}));

const { ydoc, wsProvider, persistence, network } = connectSharedDoc();
const adapter = createZustandAdapter(useTodoStore);
const backend = createYjsBackend(ydoc, SYNC_MAP_NAME, { text: isTodoTitle });
const syncEngine = createSyncEngine(backend, adapter);

syncEngine.connect();

/** The store as the devtools panel sees it. */
const devtoolsSource: DevtoolsSource = {
  name: "Zustand todos",
  adapter,
  backend,
  engine: syncEngine,
  persistence,
  network,
};

export { devtoolsSource, syncEngine, ydoc, wsProvider };
