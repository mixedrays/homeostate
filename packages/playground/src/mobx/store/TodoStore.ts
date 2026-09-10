import { makeAutoObservable } from 'mobx';
import { createSyncEngine } from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';
import { createMobxAdapter } from '@homeostate/adapter-mobx';
import type { FilterStatus, Todo, TodoState } from '../../types/todo';
import { countTodos, filterTodos } from '../../lib/todos';
import { SYNC_MAP_NAME, connectSharedDoc, createInitialTodoState } from '../../sync';

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

const { ydoc, wsProvider } = connectSharedDoc();
const adapter = createMobxAdapter(todoStore, ['todos', 'searchTerm', 'filterStatus'], initialState);
const syncEngine = createSyncEngine(createYjsBackend(ydoc, SYNC_MAP_NAME), adapter);

syncEngine.connect();

export { syncEngine, ydoc, wsProvider };
