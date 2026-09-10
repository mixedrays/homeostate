import { create } from 'zustand';
import { createSyncEngine } from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';
import { createZustandAdapter } from '@homeostate/adapter-zustand';
import type { FilterStatus, TodoState } from '../../types/todo';
import { SYNC_MAP_NAME, connectSharedDoc, createInitialTodoState } from '../../sync';

interface TodoStore extends TodoState {
  addTodo: (title: string) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  setSearchTerm: (term: string) => void;
  setFilterStatus: (status: FilterStatus) => void;
}

const initialState = createInitialTodoState();

export const useTodoStore = create<TodoStore>((set) => ({
  ...initialState,

  addTodo: (title) =>
    set((state) => ({
      todos: [...state.todos, { id: crypto.randomUUID(), title, completed: false }],
    })),

  toggleTodo: (id) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      ),
    })),

  deleteTodo: (id) =>
    set((state) => ({
      todos: state.todos.filter((todo) => todo.id !== id),
    })),

  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setFilterStatus: (filterStatus) => set({ filterStatus }),
}));

const { ydoc, wsProvider } = connectSharedDoc();
const adapter = createZustandAdapter(useTodoStore);
const syncEngine = createSyncEngine(createYjsBackend(ydoc, SYNC_MAP_NAME), adapter);

syncEngine.connect();

export { syncEngine, ydoc, wsProvider };
