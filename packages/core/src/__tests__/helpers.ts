import { expect } from "vitest";
import type { StoreAdapter, TextPolicy } from "../index.js";

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

/** Todo titles are collaborative text; every other string is a value. */
export const todoTitles: TextPolicy = (path) =>
  path.length === 3 && path[0] === "todos" && path[2] === "title";

/**
 * Short values two peers replace at the same time: an enum-like flag, an id and a timestamp.
 * Merged as text, they became `"compctiveeted"`, `"user-32"` and `"2026-09-12T10:01:05Z"`.
 */
export const concurrentReplacements = {
  before: { filterStatus: "all", id: "user-1", at: "2026-09-12T10:00:00Z" },
  a: { filterStatus: "active", id: "user-2", at: "2026-09-12T10:00:05Z" },
  b: { filterStatus: "completed", id: "user-3", at: "2026-09-12T10:01:00Z" },
};

/**
 * Asserts that `merged` holds, for every key of `concurrentReplacements`, the value one of the
 * two peers wrote.
 */
export const expectOneWrittenValue = (merged: unknown): void => {
  const { a, b } = concurrentReplacements;
  for (const key of Object.keys(a) as (keyof typeof a)[])
    expect([a[key], b[key]]).toContain((merged as typeof a)[key]);
};

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

/**
 * Writes holding values JSON cannot hold: `[name, before, next, expected]`, where `expected` is
 * what `JSON.stringify` makes of `next` and every backend reads back. Shared regressions for core
 * and every CRDT backend.
 */
export const nonJsonWrites: [string, object, object, object][] = [
  [
    "an undefined item in a fresh array",
    {},
    { b: 1, list: [1, undefined, 2] },
    { b: 1, list: [1, null, 2] },
  ],
  [
    "an existing item that becomes undefined",
    { list: [1, 2] },
    { c: 1, list: [1, undefined] },
    { c: 1, list: [1, null] },
  ],
  [
    "an inserted undefined item",
    { list: [1] },
    { list: [undefined, 1] },
    { list: [null, 1] },
  ],
  [
    "a null item that becomes undefined",
    { list: [null, 1] },
    { list: [undefined, 1] },
    { list: [null, 1] },
  ],
  [
    "object entries that become undefined",
    { a: 1, nested: { c: 1 } },
    { a: undefined, b: 1, nested: { c: undefined, d: 1 } },
    { b: 1, nested: { d: 1 } },
  ],
  [
    "a nested function",
    {},
    { nested: { a: 1, fn: () => 1 } },
    { nested: { a: 1 } },
  ],
  ["a function array item", {}, { list: [() => 1] }, { list: [null] }],
  ["a top-level function", {}, { a: 1, fn: () => 1 }, { a: 1 }],
  [
    "a sparse array",
    {},
    { list: Object.assign([], { 0: 1, 2: 2 }) },
    { list: [1, null, 2] },
  ],
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
