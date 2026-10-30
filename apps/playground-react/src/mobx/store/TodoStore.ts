import { makeAutoObservable } from "mobx";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createMobxAdapter, syncMobxStore } from "@homeostate/store-mobx";
import type { DevtoolsSource } from "@homeostate/tool-devtools";
import type { FilterStatus, Todo, TodoState } from "../../types/todo";
import { countTodos, filterTodos } from "../../lib/todos";
import {
  isTodoTitle,
  SYNC_MAP_NAME,
  connectSharedDoc,
  createInitialTodoState,
} from "../../sync";

const initialState = createInitialTodoState();

class TodoStore implements TodoState {
  todos: Todo[] = initialState.todos.map((todo) => ({ ...todo }));
  searchTerm = initialState.searchTerm;
  filterStatus: FilterStatus = initialState.filterStatus;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  addTodo(title: string) {
    this.todos.push({ id: crypto.randomUUID(), title, completed: false });
  }

  toggleTodo(id: string) {
    const todo = this.todos.find((t) => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
    }
  }

  editTodo(id: string, title: string) {
    const todo = this.todos.find((t) => t.id === id);
    if (todo) {
      todo.title = title;
    }
  }

  deleteTodo(id: string) {
    this.todos = this.todos.filter((t) => t.id !== id);
  }

  setSearchTerm(term: string) {
    this.searchTerm = term;
  }

  setFilterStatus(status: FilterStatus) {
    this.filterStatus = status;
  }

  get filteredTodos() {
    return filterTodos(this.todos, this.searchTerm, this.filterStatus);
  }

  get counts() {
    return countTodos(this.todos);
  }
}

export const todoStore = new TodoStore();

const { ydoc, wsProvider, persistence, network } = connectSharedDoc();
const backend = createYjsBackend(ydoc, SYNC_MAP_NAME, { text: isTodoTitle });
const syncEngine = syncMobxStore(todoStore, { backend });

/** The store as the devtools panel sees it. */
const devtoolsSource: DevtoolsSource = {
  name: "MobX todos",
  adapter: createMobxAdapter(todoStore),
  backend,
  engine: syncEngine,
  persistence,
  network,
};

export { devtoolsSource, syncEngine, ydoc, wsProvider };
