import {
  createSlice,
  configureStore,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createReduxAdapter, homeostate } from "@homeostate/store-redux";
import type { DevtoolsSource } from "@homeostate/tool-devtools";
import type { FilterStatus } from "../../types/todo";
import {
  isTodoTitle,
  SYNC_MAP_NAME,
  connectSharedDoc,
  createInitialTodoState,
} from "../../sync";

const initialState = createInitialTodoState();
const { ydoc, wsProvider, persistence, network } = connectSharedDoc();
const backend = createYjsBackend(ydoc, SYNC_MAP_NAME, { text: isTodoTitle });

const todoSlice = createSlice({
  name: "todos",
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
    editTodo: (state, action: PayloadAction<{ id: string; title: string }>) => {
      const todo = state.todos.find((t) => t.id === action.payload.id);
      if (todo) {
        todo.title = action.payload.title;
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
  },
});

export const {
  addTodo,
  toggleTodo,
  editTodo,
  deleteTodo,
  setSearchTerm,
  setFilterStatus,
} = todoSlice.actions;

export const store = configureStore({
  reducer: todoSlice.reducer,
  enhancers: (getDefaultEnhancers) =>
    getDefaultEnhancers().prepend(homeostate({ backend })),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

const syncEngine = store.homeostate;

/** The store as the devtools panel sees it. */
const devtoolsSource: DevtoolsSource = {
  name: "Redux todos",
  adapter: createReduxAdapter(store),
  backend,
  engine: syncEngine,
  persistence,
  network,
};

export { devtoolsSource, syncEngine, ydoc, wsProvider };
