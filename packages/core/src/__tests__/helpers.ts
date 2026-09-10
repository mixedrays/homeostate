import type { StoreAdapter } from '../index.js';

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

export interface TodoState {
  todos: Todo[];
  searchTerm: string;
  filterStatus: 'all' | 'active' | 'completed';
}

export const todo = (id: string, title = `Todo ${id}`): Todo => ({ id, title, completed: false });

export const threeTodos = (): TodoState => ({
  todos: [todo('1'), todo('2'), todo('3')],
  searchTerm: '',
  filterStatus: 'all',
});

export const manyTodos = (count: number): TodoState => ({
  todos: Array.from({ length: count }, (_, i) => todo(String(i + 1))),
  searchTerm: '',
  filterStatus: 'all',
});

export const toggleTodo = (state: TodoState, id: string): TodoState => ({
  ...state,
  todos: state.todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
});

export const addTodo = (state: TodoState, item: Todo): TodoState => ({
  ...state,
  todos: [...state.todos, item],
});

export const deleteTodo = (state: TodoState, id: string): TodoState => ({
  ...state,
  todos: state.todos.filter((t) => t.id !== id),
});

export const renameTodo = (state: TodoState, id: string, title: string): TodoState => ({
  ...state,
  todos: state.todos.map((t) => (t.id === id ? { ...t, title } : t)),
});

export const setSearchTerm = (state: TodoState, searchTerm: string): TodoState => ({
  ...state,
  searchTerm,
});

export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

export const snapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export interface TestStore<S> {
  adapter: StoreAdapter<S>;
  getState: () => S;
  setState: (next: S) => void;
  update: (recipe: (state: S) => S) => void;
}

export const createTestStore = <S>(initial: S, prepare: (next: S) => S = (s) => s): TestStore<S> => {
  let state = prepare(initial);
  const listeners = new Set<() => void>();

  const setState = (next: S): void => {
    state = prepare(next);
    listeners.forEach((listener) => listener());
  };

  return {
    adapter: {
      getState: () => state,
      setState: (next) => setState(next),
      subscribe: (onStoreChange) => {
        listeners.add(onStoreChange);
        return () => {
          listeners.delete(onStoreChange);
        };
      },
      getInitialState: () => initial,
    },
    getState: () => state,
    setState,
    update: (recipe) => setState(recipe(state)),
  };
};
