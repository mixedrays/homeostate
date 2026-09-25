import { describe, expect, it, vi } from 'vitest';
import { isObservableArray, makeAutoObservable, reaction } from 'mobx';
import { createMemoryBackend, createSyncEngine, type MemoryBackend } from '@homeostate/core';
import { createMobxAdapter } from '../index.js';

interface Todo {
  id: string;
  title: string;
  done: boolean;
  tags?: string[];
}

class TodoStore {
  todos: Todo[] = [
    { id: '1', title: 'a', done: false },
    { id: '2', title: 'b', done: false },
  ];
  filter = 'all';
  /** Deliberately left out of `syncableKeys`, so the adapter must not carry it. */
  draft = '';

  constructor() {
    makeAutoObservable(this);
  }

  toggle(id: string): void {
    const todo = this.todos.find((one) => one.id === id);
    if (todo) todo.done = !todo.done;
  }

  setFilter(filter: string): void {
    this.filter = filter;
  }
}

const syncedKeys: (keyof TodoStore)[] = ['todos', 'filter'];

const connect = (store: TodoStore, backend: MemoryBackend = createMemoryBackend()) => {
  const engine = createSyncEngine(backend, createMobxAdapter(store, syncedKeys));
  engine.connect();
  return { backend, engine };
};

/** The two todos as the backend holds them, so a test can send back a state it did not change. */
const held = (backend: MemoryBackend) => backend.read() as { todos: Todo[]; filter: string };

const countingWrites = (backend: MemoryBackend) => {
  const writes: unknown[] = [];
  const counting: MemoryBackend = {
    ...backend,
    write: (next) => {
      writes.push(next);
      backend.write(next);
    },
  };
  return { backend: counting, writes };
};

describe('MobxAdapter', () => {
  it('seeds the backend, writes store actions, and applies remote changes', () => {
    const store = new TodoStore();
    const { backend } = connect(store);

    expect(backend.read()).toEqual({
      todos: [
        { id: '1', title: 'a', done: false },
        { id: '2', title: 'b', done: false },
      ],
      filter: 'all',
    });

    store.toggle('2');
    expect(held(backend).todos[1].done).toBe(true);

    backend.receive({ todos: [{ id: '3', title: 'c', done: true }], filter: 'done' });
    expect(store.todos.map((todo) => todo.id)).toEqual(['3']);
    expect(store.filter).toBe('done');
  });

  it('reads plain JSON for the synced keys and nothing else', () => {
    const store = new TodoStore();
    const adapter = createMobxAdapter(store, syncedKeys);

    const state = adapter.getState();

    expect(Object.keys(state)).toEqual(['todos', 'filter']);
    expect(state).toEqual({
      todos: [
        { id: '1', title: 'a', done: false },
        { id: '2', title: 'b', done: false },
      ],
      filter: 'all',
    });
    // A snapshot, not the observable tree: `toJS` copies, so nothing here is reactive.
    expect(isObservableArray(state.todos)).toBe(false);
    expect(state.todos[0]).not.toBe(store.todos[0]);
  });

  it('keeps the identity of the array and of every todo when one field changes', () => {
    const store = new TodoStore();
    const { backend } = connect(store);
    const todos = store.todos;
    const [first, second] = store.todos;

    backend.receive({
      todos: [
        { id: '1', title: 'a', done: true },
        { id: '2', title: 'b', done: false },
      ],
      filter: 'all',
    });

    expect(store.todos[0].done).toBe(true);
    // The changed field is assigned on the node that was already there, so no `observer` row,
    // per-item `reaction` or `useEffect` keyed on an untouched todo is disturbed.
    expect(store.todos).toBe(todos);
    expect(store.todos[0]).toBe(first);
    expect(store.todos[1]).toBe(second);
  });

  it('leaves the list alone when only a top-level key changed', () => {
    const store = new TodoStore();
    const { backend } = connect(store);
    const list = vi.fn();
    const row = vi.fn();
    const stop = [
      reaction(() => store.todos.slice(), list),
      reaction(() => [store.todos[0].title, store.todos[0].done], row),
    ];

    backend.receive({ ...held(backend), filter: 'done' });

    expect(store.filter).toBe('done');
    expect(list).not.toHaveBeenCalled();
    expect(row).not.toHaveBeenCalled();
    stop.forEach((dispose) => dispose());
  });

  it('notifies only the todo the change names', () => {
    const store = new TodoStore();
    const { backend } = connect(store);
    const first = vi.fn();
    const second = vi.fn();
    const stop = [
      reaction(() => store.todos[0].done, first),
      reaction(() => store.todos[1].done, second),
    ];

    const next = held(backend);
    next.todos[0].done = true;
    backend.receive(next);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    stop.forEach((dispose) => dispose());
  });

  it('splices rather than rebuilds when the list grows, shrinks or reorders', () => {
    const store = new TodoStore();
    const { backend } = connect(store);
    const [first, second] = store.todos;

    const grown = held(backend);
    backend.receive({ ...grown, todos: [...grown.todos, { id: '3', title: 'c', done: false }] });
    expect(store.todos.map((todo) => todo.id)).toEqual(['1', '2', '3']);
    expect(store.todos[0]).toBe(first);
    expect(store.todos[1]).toBe(second);

    const shrunk = held(backend);
    backend.receive({ ...shrunk, todos: shrunk.todos.filter((todo) => todo.id !== '1') });
    expect(store.todos.map((todo) => todo.id)).toEqual(['2', '3']);
    // The survivors shifted down without being rebuilt.
    expect(store.todos[0]).toBe(second);

    const moved = held(backend);
    backend.receive({ ...moved, todos: [moved.todos[1], moved.todos[0]] });
    expect(store.todos.map((todo) => todo.id)).toEqual(['3', '2']);
  });

  it('edits a string in place and adds or removes a nested key', () => {
    const store = new TodoStore();
    const { backend } = connect(store);
    const first = store.todos[0];

    const tagged = held(backend);
    tagged.todos[0] = { ...tagged.todos[0], title: 'abc', tags: ['x'] };
    backend.receive(tagged);
    expect(store.todos[0]).toBe(first);
    expect(store.todos[0].title).toBe('abc');
    expect(store.todos[0].tags).toEqual(['x']);

    const untagged = held(backend);
    delete untagged.todos[0].tags;
    backend.receive(untagged);
    expect(store.todos[0]).toBe(first);
    expect('tags' in store.todos[0]).toBe(false);
  });

  it('does not echo a remote apply back to the backend', () => {
    const store = new TodoStore();
    const { backend, writes } = countingWrites(createMemoryBackend());
    connect(store, backend);
    writes.length = 0;

    backend.receive({ ...held(backend), filter: 'active' });

    // MobX runs reactions at the end of the enclosing action, which is the one `setState`
    // opens — so the store notification still lands inside the engine's remote guard.
    expect(writes).toHaveLength(0);
    expect(store.filter).toBe('active');
  });

  it('still sends local changes to the backend after a remote apply', () => {
    const store = new TodoStore();
    const { backend } = connect(store);

    backend.receive({ todos: [{ id: '9', title: 'i', done: false }], filter: 'all' });
    store.toggle('9');

    expect(held(backend).todos).toEqual([{ id: '9', title: 'i', done: true }]);
  });

  it('ignores keys it was not asked to sync, in both directions', () => {
    const store = new TodoStore();
    const { backend } = connect(store);

    expect('draft' in (backend.read() as object)).toBe(false);

    store.draft = 'typing';
    expect('draft' in (backend.read() as object)).toBe(false);
    expect(store.draft).toBe('typing');
  });

  it('stops both directions after disconnect', () => {
    const store = new TodoStore();
    const backend = createMemoryBackend();
    const { engine } = connect(store, backend);

    engine.disconnect();
    store.setFilter('done');
    expect(held(backend).filter).toBe('all');

    backend.receive({ todos: [], filter: 'active' });
    expect(store.filter).toBe('done');
  });
});
