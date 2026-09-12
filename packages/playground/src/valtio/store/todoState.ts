import { proxy } from 'valtio';
import { createSyncEngine } from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';
import { createValtioAdapter } from '@homeostate/adapter-valtio';
import type { FilterStatus, TodoState } from '../../types/todo';
import { SYNC_MAP_NAME, connectSharedDoc, createInitialTodoState } from '../../sync';

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

const { ydoc, wsProvider } = connectSharedDoc();
const adapter = createValtioAdapter(todoState);
const syncEngine = createSyncEngine(createYjsBackend(ydoc, SYNC_MAP_NAME), adapter);

syncEngine.connect();

export { syncEngine, ydoc, wsProvider };
