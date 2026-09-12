import { atom, createStore } from 'jotai';
import { createSyncEngine } from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';
import { createJotaiAdapter } from '@homeostate/adapter-jotai';
import type { FilterStatus, Todo, TodoState } from '../../types/todo';
import { countTodos, filterTodos } from '../../lib/todos';
import { SYNC_MAP_NAME, connectSharedDoc, createInitialTodoState } from '../../sync';

const initialState = createInitialTodoState();

export const todosAtom = atom<Todo[]>(initialState.todos);
export const searchTermAtom = atom(initialState.searchTerm);
export const filterStatusAtom = atom<FilterStatus>(initialState.filterStatus);

export const todoStateAtom = atom(
  (get): TodoState => ({
    todos: get(todosAtom),
    searchTerm: get(searchTermAtom),
    filterStatus: get(filterStatusAtom),
  }),
  (_get, set, next: TodoState) => {
    set(todosAtom, next.todos);
    set(searchTermAtom, next.searchTerm);
    set(filterStatusAtom, next.filterStatus);
  }
);

export const visibleTodosAtom = atom((get) =>
  filterTodos(get(todosAtom), get(searchTermAtom), get(filterStatusAtom))
);

export const todoCountsAtom = atom((get) => countTodos(get(todosAtom)));

export const addTodoAtom = atom(null, (get, set, title: string) => {
  set(todosAtom, [...get(todosAtom), { id: crypto.randomUUID(), title, completed: false }]);
});

export const toggleTodoAtom = atom(null, (get, set, id: string) => {
  set(
    todosAtom,
    get(todosAtom).map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo))
  );
});

export const deleteTodoAtom = atom(null, (get, set, id: string) => {
  set(
    todosAtom,
    get(todosAtom).filter((todo) => todo.id !== id)
  );
});

export const store = createStore();

const { ydoc, wsProvider } = connectSharedDoc();
const adapter = createJotaiAdapter(todoStateAtom, store);
const syncEngine = createSyncEngine(createYjsBackend(ydoc, SYNC_MAP_NAME), adapter);

syncEngine.connect();

export { syncEngine, ydoc, wsProvider };
