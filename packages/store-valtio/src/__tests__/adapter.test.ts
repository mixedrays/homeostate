import { describe, expect, it } from 'vitest';
import { proxy, snapshot } from 'valtio/vanilla';
import { createMemoryBackend, createSyncEngine } from '@homeostate/core';
import { createValtioAdapter } from '../index.js';

interface Todo {
  id: string;
  done: boolean;
}

const createTodos = () =>
  proxy({
    todos: [{ id: '1', done: false }, { id: '2', done: false }] as Todo[],
    filter: 'all',
    toggle(id: string) {
      const todo = this.todos.find((t) => t.id === id);
      if (todo) todo.done = !todo.done;
    },
  });

const plain = (state: ReturnType<typeof createTodos>) => {
  const { todos, filter } = snapshot(state);
  return { todos, filter };
};

describe('ValtioAdapter', () => {
  it('seeds the backend, writes proxy mutations, and applies remote changes', () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(backend, createValtioAdapter(state));

    engine.connect();
    expect(backend.read()).toEqual(plain(state));

    state.toggle('2');
    expect(backend.read()).toEqual({
      todos: [{ id: '1', done: false }, { id: '2', done: true }],
      filter: 'all',
    });

    backend.receive({ todos: [{ id: '3', done: true }], filter: 'done' });
    expect(plain(state)).toEqual({ todos: [{ id: '3', done: true }], filter: 'done' });
    expect(typeof state.toggle).toBe('function');
  });

  it('adopts a non-empty backend as the initial state', () => {
    const state = createTodos();
    const backend = createMemoryBackend({ todos: [], filter: 'active' });

    createSyncEngine(backend, createValtioAdapter(state)).connect();

    expect(plain(state)).toEqual({ todos: [], filter: 'active' });
  });

  it('keeps the proxy mutable after remote changes and syncs those mutations back', () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createValtioAdapter(state)).connect();

    backend.receive({ todos: [{ id: '9', done: false }], filter: 'all' });
    state.toggle('9');

    expect(snapshot(state).todos[0].done).toBe(true);
    expect(backend.read()).toEqual({ todos: [{ id: '9', done: true }], filter: 'all' });
  });

  it('preserves the identity of unchanged subtrees when applying remote changes', () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createValtioAdapter(state)).connect();
    const untouched = snapshot(state).todos[1];

    backend.receive({ todos: [{ id: '1', done: true }, { id: '2', done: false }], filter: 'all' });

    expect(snapshot(state).todos[0].done).toBe(true);
    expect(snapshot(state).todos[1]).toBe(untouched);
  });

  it('stops both directions after disconnect', () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(backend, createValtioAdapter(state));
    engine.connect();

    engine.disconnect();
    state.filter = 'done';
    expect((backend.read() as { filter: string }).filter).toBe('all');

    backend.receive({ todos: [], filter: 'active' });
    expect(snapshot(state).filter).toBe('done');
  });
});
