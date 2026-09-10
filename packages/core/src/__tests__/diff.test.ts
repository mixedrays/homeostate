import { describe, expect, it } from 'vitest';
import { ChangeType, getChanges, type Change, type Diffable } from '../index.js';
import { patchState } from '../patching.js';

const { INSERT, UPDATE, DELETE, PENDING } = ChangeType;

const item = (id: string, done = false) => ({ id, done });

const appliesCleanly = (a: Diffable, b: Diffable): void => {
  expect(patchState(a, b)).toEqual(b);
};

const applySequentially = (array: unknown[], changes: Change[]): unknown[] => {
  const revised = [...array];
  for (const [type, index, value] of changes) {
    const i = index as number;
    if (type === INSERT) revised.splice(i, 0, value);
    else if (type === UPDATE) revised[i] = value;
    else if (type === DELETE) revised.splice(i, 1);
  }
  return revised;
};

let seed = 42;
const random = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const randomArray = (): unknown[] =>
  Array.from({ length: Math.floor(random() * 6) }, () => Math.floor(random() * 4));
const randomPairs = Array.from({ length: 2000 }, () => [randomArray(), randomArray()] as const);

describe('getChanges', () => {
  it('returns no changes when the root values are of different kinds', () => {
    expect(getChanges('abc', ['a', 'b', 'c'])).toEqual([]);
    expect(getChanges([1], { 0: 1 })).toEqual([]);
    expect(getChanges({ a: 1 }, 'a')).toEqual([]);
  });

  describe('strings', () => {
    it('returns no changes for equal strings', () => {
      expect(getChanges('same', 'same')).toEqual([]);
      expect(getChanges('', '')).toEqual([]);
    });

    it('inserts the whole string at once when the old string is empty', () => {
      expect(getChanges('', 'ab')).toEqual([[INSERT, 0, 'ab']]);
    });

    it('deletes at index 0 once per character when the new string is empty', () => {
      expect(getChanges('ab', '')).toEqual([
        [DELETE, 0, undefined],
        [DELETE, 0, undefined],
      ]);
    });

    it('replaces everything when no character is shared', () => {
      expect(getChanges('ab', 'cd')).toEqual([
        [DELETE, 0, undefined],
        [DELETE, 0, undefined],
        [INSERT, 0, 'cd'],
      ]);
    });

    it('appends a run of characters as one insert', () => {
      expect(getChanges('Todo 1', 'Todo 1 A')).toEqual([[INSERT, 6, ' A']]);
    });

    it('prepends a run of characters as one insert', () => {
      expect(getChanges('Todo 1', 'B Todo 1')).toEqual([[INSERT, 0, 'B ']]);
    });

    it('inserts a pasted run of characters as one change', () => {
      const paste = 'lorem ipsum dolor sit amet';

      expect(getChanges('x', `x${paste}`)).toEqual([[INSERT, 1, paste]]);
    });

    it('emits deletions at their position in the progressively edited string', () => {
      expect(getChanges('abc', 'ac')).toEqual([[DELETE, 1, undefined]]);
      expect(getChanges('abcd', 'ad')).toEqual([
        [DELETE, 1, undefined],
        [DELETE, 1, undefined],
      ]);
    });

    it.each([
      ['hello', 'help'],
      ['kitten', 'sitting'],
      ['abc', 'abcabc'],
      ['abcabc', 'abc'],
      ['aaa', 'a'],
      ['a', 'aaa'],
      ['x', 'y'],
      ['search', 'sea'],
      ['sea', 'search'],
      ['abcdef', 'fedcba'],
      ['Todo 1', 'B Todo 1 A'],
      ['the quick brown fox', 'the slow brown cat'],
      ['aXbXc', 'abc'],
      ['abc', 'aXbXc'],
    ])('transforms %j into %j when applied', appliesCleanly);
  });

  describe('arrays', () => {
    it('returns no changes for equal arrays', () => {
      expect(getChanges([], [])).toEqual([]);
      expect(getChanges([1, 'a', null], [1, 'a', null])).toEqual([]);
      expect(getChanges([item('1'), [1, 2]], [item('1'), [1, 2]])).toEqual([]);
    });

    it('inserts appended items after the last index', () => {
      expect(getChanges([1, 2], [1, 2, 3])).toEqual([[INSERT, 2, 3]]);
      expect(getChanges([1], [1, 2, 3])).toEqual([
        [INSERT, 1, 2],
        [INSERT, 2, 3],
      ]);
      expect(getChanges([item('1')], [item('1'), item('2')])).toEqual([[INSERT, 1, item('2')]]);
    });

    it('inserts everything when the old array is empty', () => {
      expect(getChanges([], [1, 2])).toEqual([
        [INSERT, 0, 1],
        [INSERT, 1, 2],
      ]);
    });

    it('deletes every item when the new array is empty', () => {
      expect(getChanges([1, 2], [])).toEqual([
        [DELETE, 0, undefined],
        [DELETE, 0, undefined],
      ]);
    });

    it('deletes trailing items at their progressively revised index', () => {
      expect(getChanges([1, 2, 3], [1, 2])).toEqual([[DELETE, 2, undefined]]);
      expect(getChanges([1, 2, 3, 4], [1])).toEqual([
        [DELETE, 1, undefined],
        [DELETE, 1, undefined],
        [DELETE, 1, undefined],
      ]);
    });

    it('inserts a primitive or an object in the middle', () => {
      expect(getChanges([1, 3], [1, 2, 3])).toEqual([[INSERT, 1, 2]]);
      expect(getChanges([item('1'), item('3')], [item('1'), item('2'), item('3')])).toEqual([
        [INSERT, 1, item('2')],
      ]);
    });

    it('inserts a primitive or an object at the start', () => {
      expect(getChanges([2, 3], [1, 2, 3])).toEqual([[INSERT, 0, 1]]);
      expect(getChanges([item('1')], [item('0'), item('1')])).toEqual([[INSERT, 0, item('0')]]);
    });

    it('removes a middle item with a single delete', () => {
      expect(getChanges([item('1'), item('2'), item('3')], [item('1'), item('3')])).toEqual([
        [DELETE, 1, undefined],
      ]);

      const many = Array.from({ length: 50 }, (_, i) => item(String(i + 1)));
      expect(getChanges(many, many.filter((t) => t.id !== '25'))).toEqual([
        [DELETE, 24, undefined],
      ]);
    });

    it('updates changed primitives in place', () => {
      expect(getChanges([1, 2, 3], [1, 9, 3])).toEqual([[UPDATE, 1, 9]]);
      expect(getChanges(['a', 1, null, true], ['a', 2, null, false])).toEqual([
        [UPDATE, 1, 2],
        [UPDATE, 3, false],
      ]);
    });

    it('recurses into changed items', () => {
      expect(getChanges([item('1'), item('2')], [item('1'), item('2', true)])).toEqual([
        [PENDING, 1, [[UPDATE, 'done', true]]],
      ]);
      expect(getChanges([[1], [2]], [[1], [2, 3]])).toEqual([[PENDING, 1, [[INSERT, 1, 3]]]]);
      expect(getChanges(['ab'], ['abc'])).toEqual([[PENDING, 0, [[INSERT, 2, 'c']]]]);
    });

    it('updates an item whose kind changed', () => {
      expect(getChanges([[1]], [{ a: 1 }])).toEqual([[UPDATE, 0, { a: 1 }]]);
      expect(getChanges(['a'], [['a']])).toEqual([[UPDATE, 0, ['a']]]);
      expect(getChanges([{ a: 1 }], [1])).toEqual([[UPDATE, 0, 1]]);
      expect(getChanges([1], [{ a: 1 }])).toEqual([[UPDATE, 0, { a: 1 }]]);
    });

    it('addresses later items by their shifted position after an insert', () => {
      expect(
        getChanges([item('1'), item('2')], [item('0'), item('1'), item('2', true)])
      ).toEqual([
        [INSERT, 0, item('0')],
        [PENDING, 2, [[UPDATE, 'done', true]]],
      ]);
      expect(getChanges([2, 3], [1, 2, 3, 4])).toEqual([
        [INSERT, 0, 1],
        [INSERT, 3, 4],
      ]);
      expect(getChanges([1, 2, 3], [0, 1])).toEqual([
        [INSERT, 0, 0],
        [DELETE, 2, undefined],
        [DELETE, 2, undefined],
      ]);
    });

    it('emits indices a sequential applier can use without sorting or clamping', () => {
      for (const [a, b] of randomPairs) {
        const changes = getChanges(a, b);
        const indices = changes.map(([, index]) => index as number);

        expect(indices).toEqual([...indices].sort((x, y) => x - y));
        expect(applySequentially(a, changes)).toEqual(b);
      }
    });

    it.each([
      [[1, 2, 3], [0, 1]],
      [[2, 3], [1, 2, 3, 4]],
      [[1, 2, 3, 4], [1]],
      [[1, 2], []],
      [[], [1, 2]],
      [[1, 2, 3], [1, 3]],
      [[1, 3], [1, 2, 3]],
      [[3], [1, 2, 3]],
      [[1, 2, 3], [3, 2, 1]],
      [[1, 1, 2], [1, 2, 2]],
      [[item('1'), item('2')], [item('0'), item('1'), item('2', true)]],
      [[item('1'), item('2'), item('3')], [item('3'), item('1')]],
      [[[1, 2], [3]], [[1], [3, 4]]],
      [['ab', 'cd'], ['abc', 'd', 'e']],
      [[{ a: 1 }, 2], [1, { a: 2 }]],
    ])('transforms %j into %j when applied', appliesCleanly);
  });

  describe('records', () => {
    it('returns no changes for equal records', () => {
      expect(getChanges({}, {})).toEqual([]);
      expect(getChanges({ a: 1, s: 'x', o: { l: [1] } }, { a: 1, s: 'x', o: { l: [1] } })).toEqual([]);
    });

    it('inserts added keys', () => {
      expect(getChanges({ a: 1 }, { a: 1, b: 2 })).toEqual([[INSERT, 'b', 2]]);
      expect(getChanges({}, { o: { x: 1 } })).toEqual([[INSERT, 'o', { x: 1 }]]);
    });

    it('deletes removed keys, functions included', () => {
      expect(getChanges({ a: 1, b: 2 }, { a: 1 })).toEqual([[DELETE, 'b', undefined]]);
      expect(getChanges({ a: 1, fn: () => {} }, { a: 1 })).toEqual([[DELETE, 'fn', undefined]]);
    });

    it('updates changed primitives', () => {
      expect(getChanges({ a: 1 }, { a: 2 })).toEqual([[UPDATE, 'a', 2]]);
      expect(getChanges({ a: true }, { a: false })).toEqual([[UPDATE, 'a', false]]);
    });

    it('updates values changing to or from null', () => {
      expect(getChanges({ a: null }, { a: { b: 1 } })).toEqual([[UPDATE, 'a', { b: 1 }]]);
      expect(getChanges({ a: { b: 1 } }, { a: null })).toEqual([[UPDATE, 'a', null]]);
      expect(getChanges({ a: 'x' }, { a: null })).toEqual([[UPDATE, 'a', null]]);
      expect(getChanges({ a: null }, { a: null })).toEqual([]);
    });

    it('recurses into nested objects, arrays, and strings', () => {
      expect(getChanges({ o: { x: 1 } }, { o: { x: 2 } })).toEqual([[PENDING, 'o', [[UPDATE, 'x', 2]]]]);
      expect(getChanges({ l: [1] }, { l: [1, 2] })).toEqual([[PENDING, 'l', [[INSERT, 1, 2]]]]);
      expect(getChanges({ t: 'ab' }, { t: 'abc' })).toEqual([[PENDING, 't', [[INSERT, 2, 'c']]]]);
      expect(getChanges({ o: { l: [{ x: 1 }] } }, { o: { l: [{ x: 2 }] } })).toEqual([
        [PENDING, 'o', [[PENDING, 'l', [[PENDING, 0, [[UPDATE, 'x', 2]]]]]]],
      ]);
    });

    it('updates a value whose kind changed', () => {
      expect(getChanges({ v: { a: 1 } }, { v: [1] })).toEqual([[UPDATE, 'v', [1]]]);
      expect(getChanges({ v: 'a' }, { v: {} })).toEqual([[UPDATE, 'v', {}]]);
      expect(getChanges({ v: [1] }, { v: '1' })).toEqual([[UPDATE, 'v', '1']]);
      expect(getChanges({ v: 'a' }, { v: 1 })).toEqual([[UPDATE, 'v', 1]]);
    });

    it('lists deletions before insertions and updates', () => {
      expect(getChanges({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual([
        [DELETE, 'a', undefined],
        [UPDATE, 'b', 3],
        [INSERT, 'c', 4],
      ]);
    });

    it.each([
      [{ a: 1, b: 2 }, { b: 3, c: 4 }],
      [{ todos: [item('1')], term: '' }, { todos: [item('0'), item('1', true)], term: 'ab' }],
      [{ v: { a: 1 } }, { v: [1] }],
      [{ deep: { l: ['a', 'b'] } }, { deep: { l: ['b'] } }],
      [{}, { a: { b: { c: [1, 'x'] } } }],
      [{ a: { b: { c: [1, 'x'] } } }, {}],
    ])('transforms %j into %j when applied', appliesCleanly);
  });

  describe('known limitations', () => {
    it('does not look inside Date, Map, or Set values, so state must be plain JSON', () => {
      expect(getChanges({ d: new Date(1) }, { d: new Date(2) })).toEqual([]);
      expect(getChanges({ m: new Map([[1, 1]]) }, { m: new Map([[1, 2]]) })).toEqual([]);
      expect(getChanges({ s: new Set([1]) }, { s: new Set([2]) })).toEqual([]);
    });
  });
});
