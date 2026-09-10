import { describe, expect, it } from 'vitest';
import { patchState } from '../src/patching.js';
import { snapshot } from './helpers.js';

describe('patchState', () => {
  it('returns the same reference when nothing changed', () => {
    const state = { a: [1, 2], b: 'x' };

    expect(patchState(state, { a: [1, 2], b: 'x' })).toBe(state);
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

  it('shares unchanged subtrees with the old state', () => {
    const oldState = { list: [{ id: '1' }, { id: '2' }], other: { keep: true } };

    const result = patchState(oldState, { list: [{ id: '1x' }, { id: '2' }], other: { keep: true } });

    expect(result.list).not.toBe(oldState.list);
    expect(result.list[0]).not.toBe(oldState.list[0]);
    expect(result.list[1]).toBe(oldState.list[1]);
    expect(result.other).toBe(oldState.other);
  });

  it('patches frozen state', () => {
    const oldState = Object.freeze({
      list: Object.freeze([Object.freeze({ id: '1', done: false })]),
    });

    expect(patchState(oldState, { list: [{ id: '1', done: true }] })).toEqual({
      list: [{ id: '1', done: true }],
    });
  });

  it('applies deletes and inserts inside strings and arrays', () => {
    expect(patchState('hello', 'help')).toBe('help');
    expect(patchState([1, 2, 3], [1, 3])).toEqual([1, 3]);
    expect(patchState([1, 3], [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
