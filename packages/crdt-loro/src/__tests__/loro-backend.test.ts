import { LoroDoc, type LoroList, type LoroMap } from 'loro-crdt';
import { describe, expect, it, vi } from 'vitest';
import { createSyncEngine, type SyncEngineConfig } from '@homeostate/core';
import { createLoroBackend } from '../index.js';
import {
  addTodo,
  createTestStore,
  deleteTodo,
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

const createPeer = (doc: LoroDoc, initial: TodoState, config?: SyncEngineConfig) => {
  const store = createTestStore(initial);
  const backend = createLoroBackend(doc, NAME);
  const engine = createSyncEngine(backend, store.adapter, config);
  engine.connect();
  return { doc, store, backend, engine };
};

const exchange = (a: LoroDoc, b: LoroDoc): void => {
  b.import(a.export({ mode: 'update', from: b.version() }));
  a.import(b.export({ mode: 'update', from: a.version() }));
};

const link = (a: LoroDoc, b: LoroDoc): void => {
  a.subscribeLocalUpdates((update) => {
    b.import(update);
  });
  b.subscribeLocalUpdates((update) => {
    a.import(update);
  });
};

const twoSyncedPeers = (initial: () => TodoState = threeTodos, idA = 1, idB = 2) => {
  const docA = new LoroDoc();
  const docB = new LoroDoc();
  docA.setPeerId(idA);
  docB.setPeerId(idB);
  const a = createPeer(docA, initial());
  exchange(docA, docB);
  const b = createPeer(docB, initial());
  return { a, b };
};

describe('createLoroBackend', () => {
  it('reads an empty document as an empty object', () => {
    expect(createLoroBackend(new LoroDoc(), NAME).read()).toEqual({});
  });

  it('ignores its own writes and reports remote imports', () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);
    const onRemoteChange = vi.fn();
    backend.subscribe(onRemoteChange);

    backend.write({ count: 1, label: 'one' });
    expect(onRemoteChange).not.toHaveBeenCalled();
    expect(backend.read()).toEqual({ count: 1, label: 'one' });

    const other = new LoroDoc();
    other.import(doc.export({ mode: 'update' }));
    other.getMap(NAME).set('count', 2);
    other.commit();
    doc.import(other.export({ mode: 'update', from: doc.version() }));
    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual({ count: 2, label: 'one' });
  });

  it('reports local commits that did not come through write', () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);
    const onRemoteChange = vi.fn();
    backend.subscribe(onRemoteChange);

    doc.getMap(NAME).set('count', 1);
    doc.commit();

    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual({ count: 1 });
  });

  it.each([
    [{ list: [1, 2, 3] }, { list: [0, 1] }],
    [{ list: [2, 3] }, { list: [1, 2, 3, 4] }],
    [{ list: [1, 2] }, { list: [] }],
    [{ list: [{ id: '1', done: false }, { id: '2', done: false }] }, { list: [{ id: '0', done: false }, { id: '1', done: false }, { id: '2', done: true }] }],
    [{ list: [{ id: '1' }, { id: '2' }, { id: '3' }] }, { list: [{ id: '1' }, { id: '3' }] }],
    [{ v: { a: 1 }, s: 'a' }, { v: [1], s: 1 }],
    [{ v: 'a' }, { v: { b: 'c' } }],
    [{ n: 1, b: true, z: null }, { n: 2, b: false, z: null }],
  ])('writes %j -> %j so that read() matches', (before, after) => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);

    backend.write(before);
    expect(backend.read()).toEqual(before);
    backend.write(after);
    expect(backend.read()).toEqual(after);
  });

  it('deletes a middle todo without rewriting the items after it', () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);
    backend.write(threeTodos());
    const todos = doc.getMap(NAME).get('todos') as LoroList;
    const third = (todos.get(2) as LoroMap).id;

    backend.write(deleteTodo(threeTodos(), '2'));

    expect(todos.toJSON()).toEqual(deleteTodo(threeTodos(), '2').todos);
    expect((todos.get(1) as LoroMap).id).toBe(third);
  });

  it('stops notifying after unsubscribe', () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);
    const onRemoteChange = vi.fn();
    const unsubscribe = backend.subscribe(onRemoteChange);

    unsubscribe();
    doc.getMap(NAME).set('count', 1);
    doc.commit();

    expect(onRemoteChange).not.toHaveBeenCalled();
  });
});

describe('two peers over Loro', () => {
  it('keeps a toggle on A and an add on B', () => {
    const { a, b } = twoSyncedPeers();

    a.store.update((s) => toggleTodo(s, '1'));
    b.store.update((s) => addTodo(s, todo('4')));
    exchange(a.doc, b.doc);

    const expected = addTodo(toggleTodo(threeTodos(), '1'), todo('4'));
    expect(a.store.getState()).toEqual(expected);
    expect(b.store.getState()).toEqual(expected);
  });

  it.each([
    [1, 2],
    [2, 1],
  ])('keeps a delete of t2 on A and a toggle of t3 on B (peer ids %i and %i)', (idA, idB) => {
    const { a, b } = twoSyncedPeers(threeTodos, idA, idB);

    a.store.update((s) => deleteTodo(s, '2'));
    b.store.update((s) => toggleTodo(s, '3'));
    exchange(a.doc, b.doc);

    const expected = toggleTodo(deleteTodo(threeTodos(), '2'), '3');
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
  ])('late joiner adopts existing todos without wiping them (peer ids %i and %i)', (idA, idB) => {
    const docA = new LoroDoc();
    const docB = new LoroDoc();
    docA.setPeerId(idA);
    docB.setPeerId(idB);
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

  it('sends one small update per toggle, add, keystroke, and middle delete with 50 todos', () => {
    const { a, b } = twoSyncedPeers(() => manyTodos(50));
    link(a.doc, b.doc);
    const sizes: number[] = [];
    a.doc.subscribeLocalUpdates((update) => {
      sizes.push(update.byteLength);
    });

    a.store.update((s) => toggleTodo(s, '25'));
    expect(sizes).toHaveLength(1);
    a.store.update((s) => addTodo(s, todo('51')));
    expect(sizes).toHaveLength(2);
    a.store.update((s) => setSearchTerm(s, 'x'));
    expect(sizes).toHaveLength(3);
    a.store.update((s) => deleteTodo(s, '10'));
    expect(sizes).toHaveLength(4);

    expect(sizes.every((size) => size < 200)).toBe(true);
    expect(b.store.getState()).toEqual(a.store.getState());
  });
});
