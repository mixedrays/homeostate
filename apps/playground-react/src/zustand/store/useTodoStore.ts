import { create } from "zustand";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createZustandAdapter, homeostate } from "@homeostate/store-zustand";
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
const { ydoc, wsProvider, persistence, network } = connectSharedDoc();
const backend = createYjsBackend(ydoc, SYNC_MAP_NAME, { text: isTodoTitle });

export const useTodoStore = create<TodoStore>()(
  homeostate(
    (set) => ({
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
    }),
    { backend },
  ),
);

const syncEngine = useTodoStore.homeostate;

/** The store as the devtools panel sees it. */
const devtoolsSource: DevtoolsSource = {
  name: "Zustand todos",
  adapter: createZustandAdapter(useTodoStore),
  backend,
  engine: syncEngine,
  persistence,
  network,
};

export { devtoolsSource, syncEngine, ydoc, wsProvider };
