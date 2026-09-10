import { describe, expect, it } from 'vitest';
import { patchState } from '../patching.js';
import { snapshot } from './helpers.js';

describe('patchState', () => {
  it('returns the same reference when nothing changed', () => {
    const state = { a: [1, 2], b: 'x', o: { n: null } };

    expect(patchState(state, { a: [1, 2], b: 'x', o: { n: null } })).toBe(state);
  });

  it('never mutates its inputs', () => {
    const oldState = { todos: [{ id: '1', done: false }], term: 'ab' };
    const newState = { todos: [{ id: '1', done: true }, { id: '2', done: false }], term: 'abc' };
    const oldSnapshot = snapshot(oldState);
    const newSnapshot = snapshot(newState);

    const result = patchState(oldState, newState);

    expect(result).toEqual(newState);
    expect(oldState).toEqual(oldSnapshot);
    expect(newState).toEqual(newSnapshot);
  });

  it('copies every container along a changed path and shares the rest', () => {
    const oldState = {
      list: [{ id: '1' }, { id: '2' }],
      other: { keep: true },
      nested: { l: [{ x: 1 }, { x: 2 }] },
    };
    const newState = {
      list: [{ id: '1x' }, { id: '2' }],
      other: { keep: true },
      nested: { l: [{ x: 1 }, { x: 3 }] },
    };

    const result = patchState(oldState, newState);

    expect(result).toEqual(newState);
    expect(result).not.toBe(oldState);
    expect(result.list).not.toBe(oldState.list);
    expect(result.list[0]).not.toBe(oldState.list[0]);
    expect(result.list[1]).toBe(oldState.list[1]);
    expect(result.other).toBe(oldState.other);
    expect(result.nested).not.toBe(oldState.nested);
    expect(result.nested.l[0]).toBe(oldState.nested.l[0]);
    expect(result.nested.l[1]).not.toBe(oldState.nested.l[1]);
  });

  it('patches frozen state', () => {
    const oldState = Object.freeze({
      list: Object.freeze([Object.freeze({ id: '1', done: false })]),
    });

    expect(patchState(oldState, { list: [{ id: '1', done: true }] })).toEqual({
      list: [{ id: '1', done: true }],
    });
  });

  it('inserts, updates, and deletes object keys', () => {
    expect(patchState({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ b: 3, c: 4 });
    expect(patchState({ a: { b: 1 } }, {})).toEqual({});
  });

  it('replaces a value whose kind changed', () => {
    expect(patchState<Record<string, unknown>>({ v: { a: 1 } }, { v: [1] })).toEqual({ v: [1] });
    expect(patchState<Record<string, unknown>>({ v: 'a' }, { v: 1 })).toEqual({ v: 1 });
    expect(patchState<Record<string, unknown>>({ v: [1] }, { v: null })).toEqual({ v: null });
  });

  it('edits strings character by character', () => {
    expect(patchState('hello', 'help')).toBe('help');
    expect(patchState('', 'abc')).toBe('abc');
    expect(patchState('abc', '')).toBe('');
    expect(patchState('Todo 1', 'B Todo 1 A')).toBe('B Todo 1 A');
  });

  it('inserts and deletes array items', () => {
    expect(patchState([1, 2, 3], [1, 3])).toEqual([1, 3]);
    expect(patchState([1, 3], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(patchState([2, 3], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(patchState([1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('removes every item when the new array is empty', () => {
    expect(patchState([1, 2], [])).toEqual([]);
    expect(patchState([{ id: '1' }, { id: '2' }, { id: '3' }], [])).toEqual([]);
  });

  it('truncates to a prefix', () => {
    expect(patchState([1, 2, 3, 4], [1])).toEqual([1]);
  });

  it('applies an insert at the start followed by later changes', () => {
    expect(patchState([1, 2, 3], [0, 1])).toEqual([0, 1]);
    expect(patchState([2, 3], [1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(
      patchState(
        [{ id: '1', done: false }, { id: '2', done: false }],
        [{ id: '0', done: false }, { id: '1', done: false }, { id: '2', done: true }]
      )
    ).toEqual([{ id: '0', done: false }, { id: '1', done: false }, { id: '2', done: true }]);
  });

  it('patches nested arrays inside objects inside arrays', () => {
    const oldState = { todos: [{ id: '1', tags: ['a'] }] };
    const newState = { todos: [{ id: '1', tags: ['a', 'b'] }, { id: '2', tags: [] }] };

    expect(patchState(oldState, newState)).toEqual(newState);
  });
});
