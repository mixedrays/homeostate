import * as Y from 'yjs';
import { describe, expect, it, vi } from 'vitest';
import { createSyncEngine, type SyncEngineConfig } from '@homeostate/core';
import { createYjsBackend } from '../index.js';
import {
  addTodo,
  createTestStore,
  manyTodos,
  renameTodo,
  setSearchTerm,
  snapshot,
  threeTodos,
  todo,
  toggleTodo,
  type TodoState,
} from '../../../core/src/__tests__/helpers.js';

const NAME = 'shared';

const createPeer = (doc: Y.Doc, initial: TodoState, config?: SyncEngineConfig) => {
  const store = createTestStore(initial);
  const backend = createYjsBackend(doc, NAME);
  const engine = createSyncEngine(backend, store.adapter, config);
  engine.connect();
  return { doc, store, backend, engine };
};

const exchange = (a: Y.Doc, b: Y.Doc): void => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
};

const link = (a: Y.Doc, b: Y.Doc): void => {
  const relay = Symbol('relay');
  a.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== relay) Y.applyUpdate(b, update, relay);
  });
  b.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== relay) Y.applyUpdate(a, update, relay);
  });
};

const twoSyncedPeers = (initial: () => TodoState = threeTodos) => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  docA.clientID = 1;
  docB.clientID = 2;
  const a = createPeer(docA, initial());
  exchange(docA, docB);
  const b = createPeer(docB, initial());
  return { a, b };
};

describe('createYjsBackend', () => {
  it('ignores its own writes and reports remote transactions', () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    const onRemoteChange = vi.fn();
    backend.subscribe(onRemoteChange);

    backend.write({ count: 1, label: 'one' });
    expect(onRemoteChange).not.toHaveBeenCalled();
    expect(backend.read()).toEqual({ count: 1, label: 'one' });

    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
    other.getMap(NAME).set('count', 2);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other, Y.encodeStateVector(doc)));
    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual({ count: 2, label: 'one' });
  });

  it('reports emptiness and exposes the native map', () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);

    expect(backend.isEmpty()).toBe(true);
    backend.write({ count: 1 });
    expect(backend.isEmpty()).toBe(false);
    expect(backend.native()).toBe(doc.getMap(NAME));
  });

  it.each([
    [{ list: [1, 2, 3] }, { list: [0, 1] }],
    [{ list: [2, 3] }, { list: [1, 2, 3, 4] }],
    [{ list: [1, 2] }, { list: [] }],
    [{ list: [{ id: '1', done: false }, { id: '2', done: false }] }, { list: [{ id: '0', done: false }, { id: '1', done: false }, { id: '2', done: true }] }],
    [{ list: [{ id: '1' }, { id: '2' }, { id: '3' }] }, { list: [{ id: '1' }, { id: '3' }] }],
    [{ v: { a: 1 }, s: 'a' }, { v: [1], s: 1 }],
    [{ v: 'a' }, { v: { b: 'c' } }],
  ])('writes %j -> %j so that read() matches', (before, after) => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);

    backend.write(before);
    expect(backend.read()).toEqual(before);
    backend.write(after);
    expect(backend.read()).toEqual(after);
  });

  it('stops notifying after unsubscribe', () => {
    const doc = new Y.Doc();
    const backend = createYjsBackend(doc, NAME);
    const onRemoteChange = vi.fn();
    const unsubscribe = backend.subscribe(onRemoteChange);

    unsubscribe();
    doc.getMap(NAME).set('count', 1);

    expect(onRemoteChange).not.toHaveBeenCalled();
  });
});

describe('two peers over Yjs', () => {
  it('keeps a toggle on A and an add on B', () => {
    const { a, b } = twoSyncedPeers();

    a.store.update((s) => toggleTodo(s, '1'));
    b.store.update((s) => addTodo(s, todo('4')));
    exchange(a.doc, b.doc);

    const expected = addTodo(toggleTodo(threeTodos(), '1'), todo('4'));
    expect(a.store.getState()).toEqual(expected);
    expect(b.store.getState()).toEqual(expected);
  });

  it('keeps typed search text on A and a toggle on B', () => {
    const { a, b } = twoSyncedPeers();

    for (const term of ['a', 'ab', 'abc']) a.store.update((s) => setSearchTerm(s, term));
    b.store.update((s) => toggleTodo(s, '2'));
    exchange(a.doc, b.doc);

    const expected = toggleTodo(setSearchTerm(threeTodos(), 'abc'), '2');
    expect(a.store.getState()).toEqual(expected);
    expect(b.store.getState()).toEqual(expected);
  });

  it('merges concurrent renames of the same todo character-wise', () => {
    const { a, b } = twoSyncedPeers();

    a.store.update((s) => renameTodo(s, '1', 'Todo 1 A'));
    b.store.update((s) => renameTodo(s, '1', 'B Todo 1'));
    exchange(a.doc, b.doc);

    expect(a.store.getState().todos[0].title).toBe('B Todo 1 A');
    expect(b.store.getState().todos[0].title).toBe('B Todo 1 A');
  });

  it('gives the receiver new containers along the changed path only', () => {
    const { a, b } = twoSyncedPeers();
    const before = b.store.getState();
    const beforeSnapshot = snapshot(before);

    a.store.update((s) => toggleTodo(s, '1'));
    exchange(a.doc, b.doc);

    const after = b.store.getState();
    expect(after).toEqual(toggleTodo(threeTodos(), '1'));
    expect(after).not.toBe(before);
    expect(after.todos).not.toBe(before.todos);
    expect(after.todos[0]).not.toBe(before.todos[0]);
    expect(after.todos[1]).toBe(before.todos[1]);
    expect(after.todos[2]).toBe(before.todos[2]);
    expect(before).toEqual(beforeSnapshot);
  });

  it.each([
    [1, 2],
    [2, 1],
  ])('late joiner adopts existing todos without wiping them (clientIDs %i and %i)', (idA, idB) => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    docA.clientID = idA;
    docB.clientID = idB;
    const a = createPeer(docA, threeTodos());
    exchange(docA, docB);

    const b = createPeer(docB, {
      ...threeTodos(),
      todos: [todo('local', 'Local sample')],
    });
    expect(b.store.getState()).toEqual(threeTodos());

    exchange(docA, docB);
    expect(a.store.getState()).toEqual(threeTodos());
    expect(b.store.getState()).toEqual(threeTodos());
    expect(a.backend.read()).toEqual(threeTodos());
  });

  it('sends one small update per toggle, add, and keystroke with 50 todos', () => {
    const { a, b } = twoSyncedPeers(() => manyTodos(50));
    link(a.doc, b.doc);
    const sizes: number[] = [];
    a.doc.on('update', (update: Uint8Array) => {
      sizes.push(update.byteLength);
    });

    a.store.update((s) => toggleTodo(s, '25'));
    expect(sizes).toHaveLength(1);
    a.store.update((s) => addTodo(s, todo('51')));
    expect(sizes).toHaveLength(2);
    a.store.update((s) => setSearchTerm(s, 'x'));
    expect(sizes).toHaveLength(3);

    expect(sizes.every((size) => size < 200)).toBe(true);
    expect(b.store.getState()).toEqual(a.store.getState());
  });

  it.todo('keeps a delete of t2 on A and a toggle of t3 on B (positional array diff)');
});
