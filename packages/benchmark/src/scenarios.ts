import type { Scenario, Todo, TodoState } from './types.js';

const TITLES = [
  'Buy groceries for the week',
  'Reply to the design review thread',
  'Book the dentist appointment',
  'Write release notes for 0.2.0',
  'Water the plants on the balcony',
  'Renew the domain before it expires',
  'Prepare slides for the Monday sync',
  'Fix the flaky integration test',
];

const PASTE = [
  'Draft the quarterly roadmap, collect estimates from every team lead, and circulate the summary before the planning meeting on Thursday',
  'Refactor the billing service to use the new invoice API, migrate the fixtures, and remove the deprecated retry wrapper afterwards',
];

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const KEYSTROKES_BEFORE_RESET = 20;

export const makeTodo = (index: number, generation = 0): Todo => ({
  id: `g${generation}:${index}`,
  title: `${TITLES[index % TITLES.length]} #${index}`,
  completed: false,
});

export const makeTodos = (count: number, generation = 0): Todo[] =>
  Array.from({ length: count }, (_, i) => makeTodo(i, generation));

export const makeState = (size: number, generation = 0): TodoState => ({
  todos: makeTodos(size, generation),
  searchTerm: '',
  filterStatus: 'all',
});

export const emptyState = (): TodoState => ({ todos: [], searchTerm: '', filterStatus: 'all' });

const middle = (state: TodoState): number => Math.floor(state.todos.length / 2);

const updateTodo = (state: TodoState, index: number, update: (todo: Todo) => Todo): TodoState => ({
  ...state,
  todos: state.todos.map((todo, i) => (i === index ? update(todo) : todo)),
});

export const toggle: Scenario = {
  name: 'toggle',
  description: 'flip `completed` on one todo, a different one each iteration',
  step: (state, i) =>
    updateTodo(state, i % state.todos.length, (todo) => ({ ...todo, completed: !todo.completed })),
};

export const keystroke: Scenario = {
  name: 'keystroke',
  description: 'append one character to the title of the middle todo',
  step: (state, i) =>
    updateTodo(state, middle(state), (todo) => ({
      ...todo,
      title: todo.title + ALPHABET[i % ALPHABET.length],
    })),
  reset: (state) => {
    const index = middle(state);
    const original = makeTodo(index).title;
    if (state.todos[index].title.length - original.length < KEYSTROKES_BEFORE_RESET) return state;
    return updateTodo(state, index, (todo) => ({ ...todo, title: original }));
  },
};

export const paste: Scenario = {
  name: 'paste',
  description: 'replace the title of the middle todo with a 130-character sentence',
  step: (state, i) =>
    updateTodo(state, middle(state), (todo) => ({ ...todo, title: PASTE[i % PASTE.length] })),
};

export const search: Scenario = {
  name: 'search',
  description: 'set the top-level `searchTerm` string',
  step: (state, i) => ({ ...state, searchTerm: `query ${i}` }),
};

export const add: Scenario = {
  name: 'add',
  description: 'append a new todo',
  step: (state, i) => ({
    ...state,
    todos: [...state.todos, { id: `new:${i}`, title: `Added todo ${i}`, completed: false }],
  }),
  reset: (state, size) =>
    state.todos.length > size ? { ...state, todos: state.todos.slice(0, size) } : state,
};

export const remove: Scenario = {
  name: 'remove',
  description: 'delete the middle todo',
  step: (state) => {
    const index = middle(state);
    return { ...state, todos: state.todos.filter((_, i) => i !== index) };
  },
  reset: (state, size) => {
    if (state.todos.length >= size) return state;
    const todos = [...state.todos];
    todos.splice(middle(state), 0, makeTodo(size, 1));
    return { ...state, todos };
  },
};

export const move: Scenario = {
  name: 'move',
  description: 'drag the first todo to the end',
  step: (state) => ({ ...state, todos: [...state.todos.slice(1), state.todos[0]] }),
};

export const toggleAll: Scenario = {
  name: 'toggle-all',
  description: 'flip `completed` on every todo in one write',
  step: (state, i) => ({
    ...state,
    todos: state.todos.map((todo) => ({ ...todo, completed: i % 2 === 0 })),
  }),
  maxSize: 1000,
};

export const replace: Scenario = {
  name: 'replace',
  description: 'swap every todo for a fresh one; like toggle-all, the worst case for the array diff',
  step: (state, i) => ({ ...state, todos: makeTodos(state.todos.length, 1 + (i % 2)) }),
  maxSize: 1000,
};

export const scenarios: Scenario[] = [
  toggle,
  keystroke,
  paste,
  search,
  add,
  remove,
  move,
  toggleAll,
  replace,
];
