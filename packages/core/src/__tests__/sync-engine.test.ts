import { describe, expect, it, vi } from 'vitest';
import { createMemoryBackend, createSyncEngine } from '../index.js';
import {
  addTodo,
  createTestStore,
  deepFreeze,
  setSearchTerm,
  snapshot,
  threeTodos,
  todo,
  toggleTodo,
} from './helpers.js';

describe('createSyncEngine', () => {
  describe('connect', () => {
    it('seeds an empty backend with the filtered initial state', () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ ...threeTodos(), addTodo: () => {} });

      createSyncEngine(backend, store.adapter).connect();

      expect(backend.read()).toEqual(threeTodos());
    });

    it("leaves an empty backend alone with seed 'never'", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());

      createSyncEngine(backend, store.adapter, { seed: 'never' }).connect();

      expect(backend.isEmpty()).toBe(true);
      expect(store.getState()).toEqual(threeTodos());
    });

    it('adopts a non-empty backend and keeps non-synced members', () => {
      const backend = createMemoryBackend(threeTodos());
      const increment = () => {};
      const store = createTestStore({
        ...threeTodos(),
        todos: [todo('local')],
        searchTerm: 'local',
        increment,
      });

      createSyncEngine(backend, store.adapter).connect();

      expect(store.getState()).toEqual({ ...threeTodos(), increment });
      expect(store.getState().increment).toBe(increment);
      expect(backend.read()).toEqual(threeTodos());
    });

    it("adopts a non-empty backend even with seed 'never'", () => {
      const backend = createMemoryBackend(threeTodos());
      const store = createTestStore({ ...threeTodos(), todos: [todo('local')] });

      createSyncEngine(backend, store.adapter, { seed: 'never' }).connect();

      expect(store.getState()).toEqual(threeTodos());
    });

    it('subscribes once even when called twice', () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      engine.connect();
      engine.connect();
      const write = vi.spyOn(backend, 'write');

      store.update((s) => toggleTodo(s, '1'));

      expect(write).toHaveBeenCalledTimes(1);
      expect(engine.isConnected()).toBe(true);
    });

    it('exposes the backend', () => {
      const backend = createMemoryBackend();
      const engine = createSyncEngine(backend, createTestStore(threeTodos()).adapter);

      expect(engine.getBackend()).toBe(backend);
      expect(engine.getBackend().native().state).toEqual({});
    });
  });

  describe('store to backend', () => {
    it('writes store changes to the backend', () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();

      store.update((s) => addTodo(toggleTodo(s, '1'), todo('4')));

      expect(backend.read()).toEqual(addTodo(toggleTodo(threeTodos(), '1'), todo('4')));
    });

    it('excludes functions from every write by default', () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ ...threeTodos(), addTodo: () => {} });
      createSyncEngine(backend, store.adapter).connect();

      store.update((s) => ({ ...s, searchTerm: 'x', later: () => {} }));

      expect(backend.read()).toEqual(setSearchTerm(threeTodos(), 'x'));
    });

    it('does not echo a remote change back into the backend', () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      const write = vi.spyOn(backend, 'write');

      backend.receive(toggleTodo(threeTodos(), '1'));

      expect(write).not.toHaveBeenCalled();
    });
  });

  describe('backend to store', () => {
    it('applies remote changes with new containers along the changed path only', () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      const before = store.getState();
      const beforeSnapshot = snapshot(before);

      backend.receive(toggleTodo(threeTodos(), '1'));

      const after = store.getState();
      expect(after).toEqual(toggleTodo(threeTodos(), '1'));
      expect(after).not.toBe(before);
      expect(after.todos).not.toBe(before.todos);
      expect(after.todos[0]).not.toBe(before.todos[0]);
      expect(after.todos[1]).toBe(before.todos[1]);
      expect(after.todos[2]).toBe(before.todos[2]);
      expect(before).toEqual(beforeSnapshot);
    });

    it('removes keys deleted remotely and adds new ones', () => {
      const backend = createMemoryBackend();
      const store = createTestStore<Record<string, unknown>>({ a: 1, b: 2 });
      createSyncEngine(backend, store.adapter).connect();

      backend.receive({ b: 2, c: 3 });

      expect(store.getState()).toEqual({ b: 2, c: 3 });
    });

    it('leaves the store untouched when the remote state already matches', () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const setState = vi.spyOn(store.adapter, 'setState');
      createSyncEngine(backend, store.adapter).connect();

      backend.receive(threeTodos());

      expect(setState).not.toHaveBeenCalled();
    });

    it('works with deeply frozen store state', () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos(), deepFreeze);
      createSyncEngine(backend, store.adapter).connect();

      store.update((s) => toggleTodo(s, '2'));
      expect(backend.read()).toEqual(toggleTodo(threeTodos(), '2'));

      const remote = addTodo(toggleTodo(threeTodos(), '2'), todo('4'));
      expect(() => backend.receive(remote)).not.toThrow();
      expect(store.getState()).toEqual(remote);
      expect(Object.isFrozen(store.getState().todos)).toBe(true);
    });
  });

  describe('filter', () => {
    it('applies a custom filter in both directions', () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const filter = (key: string) => key !== 'searchTerm';
      createSyncEngine(backend, store.adapter, { filter }).connect();
      const { todos, filterStatus } = threeTodos();
      expect(backend.read()).toEqual({ todos, filterStatus });

      store.update((s) => setSearchTerm(s, 'local'));
      expect(backend.read()).toEqual({ todos, filterStatus });

      backend.receive({ ...toggleTodo(threeTodos(), '1'), searchTerm: 'remote' });
      expect(store.getState()).toEqual({ ...toggleTodo(threeTodos(), '1'), searchTerm: 'local' });
    });
  });

  describe('disconnect', () => {
    it('stops syncing in both directions', () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      engine.connect();

      engine.disconnect();
      store.update((s) => toggleTodo(s, '1'));
      backend.receive(addTodo(threeTodos(), todo('4')));

      expect(backend.read()).toEqual(addTodo(threeTodos(), todo('4')));
      expect(store.getState()).toEqual(toggleTodo(threeTodos(), '1'));
      expect(engine.isConnected()).toBe(false);
    });

    it('is safe to call twice and to reconnect afterwards, adopting the backend', () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      engine.connect();
      engine.disconnect();
      engine.disconnect();

      store.update((s) => toggleTodo(s, '1'));
      backend.receive(addTodo(threeTodos(), todo('4')));
      engine.connect();

      expect(engine.isConnected()).toBe(true);
      expect(store.getState()).toEqual(addTodo(threeTodos(), todo('4')));

      store.update((s) => toggleTodo(s, '2'));
      expect(backend.read()).toEqual(toggleTodo(addTodo(threeTodos(), todo('4')), '2'));
    });
  });
});
