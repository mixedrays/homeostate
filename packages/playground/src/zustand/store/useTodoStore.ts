import { create } from 'zustand';
import { Todo, FilterStatus } from '../../types/todo';
import * as Y from 'yjs';
import { createSyncEngine } from '@homeostate/core';
import { createZustandAdapter } from '@homeostate/adapter-zustand';
import { WebsocketProvider } from 'y-websocket';

interface TodoStore {
  todos: Todo[];
  searchTerm: string;
  filterStatus: FilterStatus;
  addTodo: (title: string) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  setSearchTerm: (term: string) => void;
  setFilterStatus: (status: FilterStatus) => void;
}

// Initial state (data only, no functions - these get synced via Yjs)
const initialState = {
  todos: [{ id: '1', title: 'asdlfjs', completed: false }] as Todo[],
  searchTerm: '',
  filterStatus: 'all' as FilterStatus,
};

// Create the Zustand store
export const useTodoStore = create<TodoStore>((set) => ({
  ...initialState,

  addTodo: (title) =>
    set((state) => ({
      todos: [
        ...state.todos,
        {
          id: crypto.randomUUID(),
          title,
          completed: false,
        },
      ],
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

// Setup Yjs sync using the new state-manager agnostic approach
const ydoc = new Y.Doc();

// Connect to WebSocket provider for P2P sync
const wsProvider = new WebsocketProvider(
  'ws://localhost:9999',
  'my-roomname',
  ydoc
);

// Create adapter and sync engine
const adapter = createZustandAdapter(useTodoStore, initialState);
const syncEngine = createSyncEngine(ydoc, adapter, { name: 'shared-ydoc' });

// Start synchronization
syncEngine.connect();

// Export for external access if needed
export { syncEngine, ydoc, wsProvider };
