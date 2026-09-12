import { describe, expect, it } from 'vitest';
import { getSnapshot, types } from 'mobx-state-tree';
import { createMemoryBackend, createSyncEngine, type MemoryBackend } from '@homeostate/core';
import { createMobxStateTreeAdapter } from '../index.js';

const Todo = types.model('Todo', {
  id: types.identifier,
  title: types.string,
  done: false,
});

const TodoStore = types
  .model('TodoStore', {
    todos: types.array(Todo),
    filter: types.optional(types.string, 'all'),
  })
  .actions((self) => ({
    add(id: string, title: string) {
      self.todos.push({ id, title });
    },
    toggle(id: string) {
      const todo = self.todos.find((t) => t.id === id);
      if (todo) todo.done = !todo.done;
    },
    reset(filter: string) {
      self.todos.clear();
      self.filter = filter;
    },
  }));

const createStore = () =>
  TodoStore.create({ todos: [{ id: '1', title: 'a' }, { id: '2', title: 'b' }] });

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

describe('MobxStateTreeAdapter', () => {
  it('seeds the backend, writes actions, and applies remote changes', () => {
    const store = createStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(backend, createMobxStateTreeAdapter(store));

    engine.connect();
    expect(backend.read()).toEqual({
      todos: [
        { id: '1', title: 'a', done: false },
        { id: '2', title: 'b', done: false },
      ],
      filter: 'all',
    });

    store.toggle('2');
    expect((backend.read() as { todos: { done: boolean }[] }).todos[1].done).toBe(true);

    backend.receive({ todos: [{ id: '3', title: 'c', done: true }], filter: 'done' });
    expect(getSnapshot(store)).toEqual({ todos: [{ id: '3', title: 'c', done: true }], filter: 'done' });
    expect(store.todos[0].done).toBe(true);
  });

  it('adopts a non-empty backend as the initial state', () => {
    const store = createStore();
    const backend = createMemoryBackend({ todos: [], filter: 'active' });

    createSyncEngine(backend, createMobxStateTreeAdapter(store)).connect();

    expect(getSnapshot(store)).toEqual({ todos: [], filter: 'active' });
  });

  it('writes once per action even when the action mutates several fields', () => {
    const store = createStore();
    const { backend, writes } = countingWrites(createMemoryBackend());
    createSyncEngine(backend, createMobxStateTreeAdapter(store)).connect();
    expect(writes).toHaveLength(1);

    store.reset('done');

    expect(writes).toHaveLength(2);
    expect(backend.read()).toEqual({ todos: [], filter: 'done' });
  });

  it('reconciles remote changes onto existing instances by identifier', () => {
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createMobxStateTreeAdapter(store)).connect();
    const second = store.todos[1];

    backend.receive({
      todos: [
        { id: '1', title: 'a', done: true },
        { id: '2', title: 'b', done: false },
      ],
      filter: 'all',
    });

    expect(store.todos[0].done).toBe(true);
    expect(store.todos[1]).toBe(second);
  });

  it('stops both directions after disconnect', () => {
    const store = createStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(backend, createMobxStateTreeAdapter(store));
    engine.connect();

    engine.disconnect();
    store.add('3', 'c');
    expect((backend.read() as { todos: unknown[] }).todos).toHaveLength(2);

    backend.receive({ todos: [], filter: 'all' });
    expect(store.todos).toHaveLength(3);
  });
});
