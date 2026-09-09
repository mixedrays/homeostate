import { createSlice, configureStore, PayloadAction } from '@reduxjs/toolkit';
import { Todo, FilterStatus } from '../../types/todo';
import * as Y from 'yjs';
import { createSyncEngine } from '@homeostate/core';
import { createReduxAdapter } from '@homeostate/adapter-redux';
import { WebsocketProvider } from 'y-websocket';

// Define the state interface
interface TodoState {
  todos: Todo[];
  searchTerm: string;
  filterStatus: FilterStatus;
}

// Initial state
const initialState: TodoState = {
  todos: [{ id: '1', title: 'Sample todo', completed: false }],
  searchTerm: '',
  filterStatus: 'all',
};

// Create the slice
const todoSlice = createSlice({
  name: 'todos',
  initialState,
  reducers: {
    addTodo: (state, action: PayloadAction<string>) => {
      state.todos.push({
        id: crypto.randomUUID(),
        title: action.payload,
        completed: false,
      });
    },
    toggleTodo: (state, action: PayloadAction<string>) => {
      const todo = state.todos.find((t) => t.id === action.payload);
      if (todo) {
        todo.completed = !todo.completed;
      }
    },
    deleteTodo: (state, action: PayloadAction<string>) => {
      state.todos = state.todos.filter((t) => t.id !== action.payload);
    },
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload;
    },
    setFilterStatus: (state, action: PayloadAction<FilterStatus>) => {
      state.filterStatus = action.payload;
    },
    // Special action for Yjs sync - replaces entire state
    setState: (_state, action: PayloadAction<TodoState>) => {
      return action.payload;
    },
  },
});

// Export actions
export const {
  addTodo,
  toggleTodo,
  deleteTodo,
  setSearchTerm,
  setFilterStatus,
  setState,
} = todoSlice.actions;

// Create the store
export const store = configureStore({
  reducer: todoSlice.reducer,
});

// Export types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Setup Yjs sync using the Redux adapter
const ydoc = new Y.Doc();

// Connect to WebSocket provider for P2P sync
// Using same room name as MobX and Zustand for cross-store sync
const wsProvider = new WebsocketProvider(
  'ws://localhost:9999',
  'my-roomname',
  ydoc
);

// Create adapter and sync engine
const adapter = createReduxAdapter(store, initialState, setState);
const syncEngine = createSyncEngine(ydoc, adapter, { name: 'shared-ydoc' });

// Start synchronization
syncEngine.connect();

// Export for external access if needed
export { syncEngine, ydoc, wsProvider };
