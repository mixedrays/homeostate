import { describe, expect, it } from 'vitest';
import { proxy, ref, snapshot } from 'valtio/vanilla';
import { reconcile } from '../reconcile.js';

const apply = <S extends object>(state: S, next: S): void => {
  reconcile(state, snapshot(state) as S, next);
};

describe('reconcile', () => {
  it('updates, adds, and deletes top-level keys', () => {
    const state = proxy<Record<string, unknown>>({ a: 1, b: 'x', c: true });

    apply(state, { a: 2, c: true, d: null });

    expect(snapshot(state)).toEqual({ a: 2, c: true, d: null });
  });

  it('recurses into nested objects and keeps untouched siblings', () => {
    const state = proxy({ user: { name: 'a', age: 1 }, settings: { theme: 'dark' } });
    const settings = state.settings;
    const settingsSnap = snapshot(state).settings;

    apply(state, { user: { name: 'b', age: 1 }, settings: settingsSnap });

    expect(snapshot(state)).toEqual({ user: { name: 'b', age: 1 }, settings: { theme: 'dark' } });
    expect(state.settings).toBe(settings);
    expect(snapshot(state).settings).toBe(settingsSnap);
  });

  it('updates array elements in place, grows, and truncates without holes', () => {
    const state = proxy({ items: [{ id: 1, done: false }, { id: 2, done: false }] });
    const second = state.items[1];

    apply(state, { items: [{ id: 1, done: true }, { id: 2, done: false }, { id: 3, done: false }] });
    expect(snapshot(state).items).toEqual([
      { id: 1, done: true },
      { id: 2, done: false },
      { id: 3, done: false },
    ]);
    expect(state.items[1]).toBe(second);

    apply(state, { items: [{ id: 1, done: true }] });
    expect(state.items.length).toBe(1);
    expect(snapshot(state).items).toEqual([{ id: 1, done: true }]);
    expect(1 in state.items).toBe(false);
  });

  it('replaces a value whose kind changed', () => {
    const state = proxy<{ value: unknown }>({ value: { nested: 1 } });

    apply(state, { value: [1, 2] });
    expect(snapshot(state).value).toEqual([1, 2]);

    apply(state, { value: 'text' });
    expect(snapshot(state).value).toBe('text');

    apply(state, { value: { nested: 2 } });
    expect(snapshot(state).value).toEqual({ nested: 2 });
  });

  it('assigns copies so snapshot-derived values stay mutable through the proxy', () => {
    const source = proxy({ todos: [{ id: 1, title: 'a' }] });
    const state = proxy({ todos: [] as { id: number; title: string }[] });

    apply(state, { todos: snapshot(source).todos as { id: number; title: string }[] });
    state.todos[0].title = 'b';

    expect(snapshot(state).todos[0].title).toBe('b');
    expect(snapshot(source).todos[0].title).toBe('a');
  });

  it('replaces ref values instead of mutating them', () => {
    const original = { v: 1 };
    const state = proxy({ r: ref(original) });

    apply(state, { r: { v: 2 } as typeof state.r });

    expect(state.r.v).toBe(2);
    expect(original.v).toBe(1);
  });
});
