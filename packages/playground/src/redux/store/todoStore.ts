import { createSlice, configureStore, type PayloadAction } from '@reduxjs/toolkit';
import { createSyncEngine } from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';
import { createReduxAdapter } from '@homeostate/adapter-redux';
import type { FilterStatus, TodoState } from '../../types/todo';
import { SYNC_MAP_NAME, connectSharedDoc, createInitialTodoState } from '../../sync';

const initialState = createInitialTodoState();

const todoSlice = createSlice({
  name: 'todos',
  initialState,
  reducers: {
    addTodo: (state, action: PayloadAction<string>) => {
      state.todos.push({ id: crypto.randomUUID(), title: action.payload, completed: false });
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
    setState: (_state, action: PayloadAction<TodoState>) => action.payload,
  },
});

export const { addTodo, toggleTodo, deleteTodo, setSearchTerm, setFilterStatus, setState } =
  todoSlice.actions;

export const store = configureStore({
  reducer: todoSlice.reducer,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

const { ydoc, wsProvider } = connectSharedDoc();
const adapter = createReduxAdapter(store, setState);
const syncEngine = createSyncEngine(createYjsBackend(ydoc, SYNC_MAP_NAME), adapter);

syncEngine.connect();

export { syncEngine, ydoc, wsProvider };
