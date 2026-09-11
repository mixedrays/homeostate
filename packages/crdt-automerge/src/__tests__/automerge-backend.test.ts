import * as A from '@automerge/automerge';
import { describe, expect, it, vi } from 'vitest';
import { createSyncEngine, type SyncEngineConfig } from '@homeostate/core';
import {
  createAutomergeBackend,
  createAutomergeHandle,
  type AutomergeHandle,
  type AutomergeHandleEvent,
} from '../index.js';
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

type Root = Record<string, unknown>;
type Handle = AutomergeHandle<Root>;

const actor = (id: number): string => id.toString(16).padStart(2, '0');

const createHandle = (id?: number): Handle =>
  createAutomergeHandle(id === undefined ? A.init<Root>() : A.init<Root>(actor(id)));

const createPeer = (handle: Handle, initial: TodoState, config?: SyncEngineConfig) => {
  const store = createTestStore(initial);
  const backend = createAutomergeBackend(handle, NAME);
  const engine = createSyncEngine(backend, store.adapter, config);
  engine.connect();
  return { handle, store, backend, engine };
};

const exchange = (a: Handle, b: Handle): void => {
  b.update((doc) => A.merge(doc, a.doc()));
  a.update((doc) => A.merge(doc, b.doc()));
};

const forward =
  (target: Handle) =>
  ({ doc, local }: AutomergeHandleEvent<Root>): void => {
    if (!local) return;
    const change = A.getLastLocalChange(doc);
    if (change !== undefined) target.update((current) => A.applyChanges(current, [change])[0]);
  };

const link = (a: Handle, b: Handle): void => {
  a.subscribe(forward(b));
  b.subscribe(forward(a));
};

const twoSyncedPeers = (initial: () => TodoState = threeTodos, idA = 1, idB = 2) => {
  const handleA = createHandle(idA);
  const handleB = createHandle(idB);
  const a = createPeer(handleA, initial());
  exchange(handleA, handleB);
  const b = createPeer(handleB, initial());
  return { a, b };
};

describe('createAutomergeBackend', () => {
  it('reads an empty document as an empty object', () => {
    expect(createAutomergeBackend(createHandle(), NAME).read()).toEqual({});
  });

  it('ignores its own writes and reports remote merges', () => {
    const handle = createHandle();
    const backend = createAutomergeBackend(handle, NAME);
    const onRemoteChange = vi.fn();
    backend.subscribe(onRemoteChange);

    backend.write({ count: 1, label: 'one' });
    expect(onRemoteChange).not.toHaveBeenCalled();
    expect(backend.read()).toEqual({ count: 1, label: 'one' });

    const other = A.change(A.load<Root>(A.save(handle.doc())), (doc) => {
      (doc[NAME] as Root).count = 2;
    });
    handle.update((doc) => A.merge(doc, other));
    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual({ count: 2, label: 'one' });
  });

  it('reports local changes that did not come through write', () => {
    const handle = createHandle();
    const backend = createAutomergeBackend(handle, NAME);
    const onRemoteChange = vi.fn();
    backend.subscribe(onRemoteChange);

    handle.change((doc) => {
      doc[NAME] = { count: 1 };
    });

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
    const backend = createAutomergeBackend(createHandle(), NAME);

    backend.write(before);
    expect(backend.read()).toEqual(before);
    backend.write(after);
    expect(backend.read()).toEqual(after);
  });

  it('treats undefined the way JSON.stringify does', () => {
    const backend = createAutomergeBackend(createHandle(), NAME);

    backend.write({ a: undefined, list: [undefined, 1] });
    expect(backend.read()).toEqual({ list: [null, 1] });
    backend.write({ a: 1, b: undefined, list: [null, 1] });
    expect(backend.read()).toEqual({ a: 1, list: [null, 1] });
    backend.write({ a: undefined, list: [null, 1] });
    expect(backend.read()).toEqual({ list: [null, 1] });
  });

  it('deletes a middle todo without rewriting the items after it', () => {
    const handle = createHandle();
    const backend = createAutomergeBackend(handle, NAME);
    backend.write(threeTodos());
    const todos = () => (handle.doc()[NAME] as TodoState).todos;
    const third = A.getObjectId(todos()[2]);

    backend.write(deleteTodo(threeTodos(), '2'));

    expect(todos()).toEqual(deleteTodo(threeTodos(), '2').todos);
    expect(A.getObjectId(todos()[1])).toBe(third);
  });

  it('shares unchanged subtrees between reads and copies the changed path', () => {
    const backend = createAutomergeBackend(createHandle(), NAME);
    backend.write(threeTodos());
    const first = backend.read() as TodoState;

    backend.write(toggleTodo(threeTodos(), '1'));
    const second = backend.read() as TodoState;

    expect(second).toEqual(toggleTodo(threeTodos(), '1'));
    expect(first).toEqual(threeTodos());
    expect(second).not.toBe(first);
    expect(second.todos).not.toBe(first.todos);
    expect(second.todos[0]).not.toBe(first.todos[0]);
    expect(second.todos[1]).toBe(first.todos[1]);
    expect(second.todos[2]).toBe(first.todos[2]);
    expect(Object.getOwnPropertySymbols(second.todos[0])).toEqual([]);
    expect(backend.read()).toBe(second);
  });

  it('stops notifying after unsubscribe', () => {
    const handle = createHandle();
    const backend = createAutomergeBackend(handle, NAME);
    const onRemoteChange = vi.fn();
    const unsubscribe = backend.subscribe(onRemoteChange);

    unsubscribe();
    handle.change((doc) => {
      doc[NAME] = { count: 1 };
    });

    expect(onRemoteChange).not.toHaveBeenCalled();
  });
});

describe('two peers over Automerge', () => {
  it('keeps a toggle on A and an add on B', () => {
    const { a, b } = twoSyncedPeers();

    a.store.update((s) => toggleTodo(s, '1'));
    b.store.update((s) => addTodo(s, todo('4')));
    exchange(a.handle, b.handle);

    const expected = addTodo(toggleTodo(threeTodos(), '1'), todo('4'));
    expect(a.store.getState()).toEqual(expected);
    expect(b.store.getState()).toEqual(expected);
  });

  it.each([
    [1, 2],
    [2, 1],
  ])('keeps a delete of t2 on A and a toggle of t3 on B (actors %i and %i)', (idA, idB) => {
    const { a, b } = twoSyncedPeers(threeTodos, idA, idB);

    a.store.update((s) => deleteTodo(s, '2'));
    b.store.update((s) => toggleTodo(s, '3'));
    exchange(a.handle, b.handle);

    const expected = toggleTodo(deleteTodo(threeTodos(), '2'), '3');
    expect(a.store.getState()).toEqual(expected);
    expect(b.store.getState()).toEqual(expected);
  });

  it('keeps typed search text on A and a toggle on B', () => {
    const { a, b } = twoSyncedPeers();

    for (const term of ['a', 'ab', 'abc']) a.store.update((s) => setSearchTerm(s, term));
    b.store.update((s) => toggleTodo(s, '2'));
    exchange(a.handle, b.handle);

    const expected = toggleTodo(setSearchTerm(threeTodos(), 'abc'), '2');
    expect(a.store.getState()).toEqual(expected);
    expect(b.store.getState()).toEqual(expected);
  });

  it('merges concurrent renames of the same todo character-wise', () => {
    const { a, b } = twoSyncedPeers();

    a.store.update((s) => renameTodo(s, '1', 'Todo 1 A'));
    b.store.update((s) => renameTodo(s, '1', 'B Todo 1'));
    exchange(a.handle, b.handle);

    expect(a.store.getState().todos[0].title).toBe('B Todo 1 A');
    expect(b.store.getState().todos[0].title).toBe('B Todo 1 A');
  });

  it('gives the receiver new containers along the changed path only', () => {
    const { a, b } = twoSyncedPeers();
    const before = b.store.getState();
    const beforeSnapshot = snapshot(before);

    a.store.update((s) => toggleTodo(s, '1'));
    exchange(a.handle, b.handle);

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
  ])('late joiner adopts existing todos without wiping them (actors %i and %i)', (idA, idB) => {
    const handleA = createHandle(idA);
    const handleB = createHandle(idB);
    const a = createPeer(handleA, threeTodos());
    exchange(handleA, handleB);

    const b = createPeer(handleB, {
      ...threeTodos(),
      todos: [todo('local', 'Local sample')],
    });
    expect(b.store.getState()).toEqual(threeTodos());

    exchange(handleA, handleB);
    expect(a.store.getState()).toEqual(threeTodos());
    expect(b.store.getState()).toEqual(threeTodos());
    expect(a.backend.read()).toEqual(threeTodos());
  });

  it('sends one small change per toggle, add, keystroke, and middle delete with 50 todos', () => {
    const { a, b } = twoSyncedPeers(() => manyTodos(50));
    link(a.handle, b.handle);
    const sizes: number[] = [];
    a.handle.subscribe(({ doc, local }) => {
      if (local) sizes.push(A.getLastLocalChange(doc)?.byteLength ?? 0);
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
