import type { StoreAdapter } from "../index.js";

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

export interface TodoState {
  todos: Todo[];
  searchTerm: string;
  filterStatus: "all" | "active" | "completed";
}

export const todo = (id: string, title = `Todo ${id}`): Todo => ({
  id,
  title,
  completed: false,
});

export const threeTodos = (): TodoState => ({
  todos: [todo("1"), todo("2"), todo("3")],
  searchTerm: "",
  filterStatus: "all",
});

export const manyTodos = (count: number): TodoState => ({
  todos: Array.from({ length: count }, (_, i) => todo(String(i + 1))),
  searchTerm: "",
  filterStatus: "all",
});

export const toggleTodo = (state: TodoState, id: string): TodoState => ({
  ...state,
  todos: state.todos.map((t) =>
    t.id === id ? { ...t, completed: !t.completed } : t,
  ),
});

export const addTodo = (state: TodoState, item: Todo): TodoState => ({
  ...state,
  todos: [...state.todos, item],
});

export const deleteTodo = (state: TodoState, id: string): TodoState => ({
  ...state,
  todos: state.todos.filter((t) => t.id !== id),
});

export const renameTodo = (
  state: TodoState,
  id: string,
  title: string,
): TodoState => ({
  ...state,
  todos: state.todos.map((t) => (t.id === id ? { ...t, title } : t)),
});

export const setSearchTerm = (
  state: TodoState,
  searchTerm: string,
): TodoState => ({
  ...state,
  searchTerm,
});

/** Shared regressions for core and every CRDT backend's text patcher. */
export const unicodeEdits: [string, string][] = [
  ["😀", "x"],
  ["😀", ""],
  ["😀", "😃"],
  ["a😀", "a😃"],
  ["a😀b", "ab"],
  ["a😀", "a"],
  ["😀😀", "😀"],
  ["😀", "😀😀"],
  ["😀", "a😀"],
  ["😀", "😀a"],
  ["😀a", "😀b"],
  ["😀ab", "😀aXb"],
  ["😀abc", "😀ac"],
  ["a😀b😃c", "a😃b😀c"],
  ["", "😀😃"],
  ["😀😃", "xy"],
  ["𐐀x𐐁", "𐐁x𐐀"],
  ["👩‍💻 works", "👩‍🔬 works!"],
  ["👍🏽!", "👍🏻!"],
  ["é😀é", "é😃é"],
];

/** Keys that `in` finds on every object, because `Object.prototype` has members by these names. */
export const prototypeMemberKeys = [
  "constructor",
  "toString",
  "valueOf",
  "hasOwnProperty",
];

/**
 * Paths of the objects in `value` that inherit from anything other than `Object.prototype` or
 * `Array.prototype`, or hold an own `__proto__` key: the ways a peer could add properties to
 * other users' state.
 */
export const prototypeHijacks = (value: unknown, path = "$"): string[] => {
  if (value === null || typeof value !== "object") return [];
  const standard = Array.isArray(value) ? Array.prototype : Object.prototype;
  const hijacked =
    Object.getPrototypeOf(value) !== standard ||
    Object.prototype.hasOwnProperty.call(value, "__proto__");
  return Object.entries(value).reduce<string[]>(
    (paths, [key, item]) => [
      ...paths,
      ...prototypeHijacks(item, `${path}.${key}`),
    ],
    hijacked ? [path] : [],
  );
};

export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

export const snapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export interface TestStore<S extends object> {
  adapter: StoreAdapter<S>;
  getState: () => S;
  setState: (next: S) => void;
  update: (recipe: (state: S) => S) => void;
}

export const createTestStore = <S extends object>(
  initial: S,
  prepare: (next: S) => S = (s) => s,
): TestStore<S> => {
  let state = prepare(initial);
  const listeners = new Set<() => void>();

  const setState = (next: S): void => {
    state = prepare(next);
    listeners.forEach((listener) => listener());
  };

  return {
    adapter: {
      getState: () => state,
      setState,
      subscribe: (onStoreChange) => {
        listeners.add(onStoreChange);
        return () => {
          listeners.delete(onStoreChange);
        };
      },
    },
    getState: () => state,
    setState,
    update: (recipe) => setState(recipe(state)),
  };
};
