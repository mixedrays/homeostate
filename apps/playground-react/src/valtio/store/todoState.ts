import { proxy } from "valtio";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createValtioAdapter } from "@homeostate/store-valtio";
import type { DevtoolsSource } from "@homeostate/tool-devtools";
import type { FilterStatus, TodoState } from "../../types/todo";
import {
  isTodoTitle,
  SYNC_MAP_NAME,
  connectSharedDoc,
  createInitialTodoState,
} from "../../sync";

export const todoState = proxy<TodoState>(createInitialTodoState());

export const todoActions = {
  addTodo(title: string) {
    todoState.todos.push({ id: crypto.randomUUID(), title, completed: false });
  },

  toggleTodo(id: string) {
    const todo = todoState.todos.find((t) => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
    }
  },

  editTodo(id: string, title: string) {
    const todo = todoState.todos.find((t) => t.id === id);
    if (todo) {
      todo.title = title;
    }
  },

  deleteTodo(id: string) {
    todoState.todos = todoState.todos.filter((t) => t.id !== id);
  },

  setSearchTerm(term: string) {
    todoState.searchTerm = term;
  },

  setFilterStatus(status: FilterStatus) {
    todoState.filterStatus = status;
  },
};

const { ydoc, wsProvider, persistence, network } = connectSharedDoc();
const adapter = createValtioAdapter(todoState);
const backend = createYjsBackend(ydoc, SYNC_MAP_NAME, { text: isTodoTitle });
const syncEngine = createSyncEngine(backend, adapter);

syncEngine.connect();

/** The store as the devtools panel sees it. */
const devtoolsSource: DevtoolsSource = {
  name: "Valtio todos",
  adapter,
  backend,
  engine: syncEngine,
  persistence,
  network,
};

export { devtoolsSource, syncEngine, ydoc, wsProvider };
