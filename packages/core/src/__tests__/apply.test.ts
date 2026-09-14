import { describe, expect, it } from 'vitest';
import { applyChanges, applyStringChanges, type ApplyOps } from '../apply.js';
import { ChangeType, type Change } from '../change.js';
import { getChanges, type Diffable } from '../diff.js';
import { snapshot } from './helpers.js';

type Plain = Record<string, unknown>;

/** The ops a plain mutable object needs, and the log of what the walk asked for. */
const createOps = () => {
  const log: string[] = [];
  const ops: ApplyOps = {
    set: (target, key, value) => {
      log.push(`set ${String(key)}`);
      (target as Plain)[key as string] = value;
    },
    remove: (target, key) => {
      log.push(`remove ${key}`);
      delete (target as Plain)[key];
    },
    splice: (target, index, deleteCount, inserted) => {
      log.push(`splice ${index} ${deleteCount} ${inserted.length}`);
      target.splice(index, deleteCount, ...inserted);
    },
  };
  return { ops, log };
};

/** Applies the edit script from `before` to `after` onto a fresh copy of `before`. */
const reconcile = <T extends object>(before: T, after: T) => {
  const { ops, log } = createOps();
  const target = snapshot(before);
  applyChanges(target, getChanges(before as Diffable, after as Diffable), ops);
  return { target, log };
};

describe('applyStringChanges', () => {
  it('revises a string by the edit script getChanges produced', () => {
    const cases: [string, string][] = [
      ['', 'abc'],
      ['abc', ''],
      ['abc', 'abcd'],
      ['abc', 'xyz'],
      ['the quick fox', 'the quick brown fox'],
      ['aaa', 'aa'],
    ];

    for (const [before, after] of cases)
      expect(applyStringChanges(before, getChanges(before, after))).toBe(after);
  });

  it('ignores a step it has no meaning for', () => {
    expect(applyStringChanges('ab', [[ChangeType.UPDATE, 0, 'z']])).toBe('ab');
  });
});

describe('applyChanges', () => {
  it('adds, replaces and removes record keys', () => {
    const { target, log } = reconcile(
      { keep: 1, drop: 2, change: 'a' },
      { keep: 1, change: 'b', added: true } as Record<string, unknown>
    );

    expect(target).toEqual({ keep: 1, change: 'b', added: true });
    expect(log).toEqual(['remove drop', 'set change', 'set added']);
  });

  it('splices an array rather than rewriting it', () => {
    const before = { list: [{ id: '1' }, { id: '2' }, { id: '3' }] };
    const after = { list: [{ id: '2' }, { id: '3' }, { id: '4' }] };

    const { target, log } = reconcile(before, after);

    expect(target).toEqual(after);
    expect(log).toEqual(['splice 0 1 0', 'splice 2 0 1']);
  });

  it('recurses into a container instead of replacing it', () => {
    const before = { list: [{ id: '1', done: false }, { id: '2', done: false }] };
    const after = { list: [{ id: '1', done: true }, { id: '2', done: false }] };
    const target = snapshot(before);
    const untouched = target.list[1];
    const edited = target.list[0];
    const { ops, log } = createOps();

    applyChanges(target, getChanges(before, after), ops);

    expect(target).toEqual(after);
    // Only the field the diff named was written; both elements are the objects that were there.
    expect(log).toEqual(['set done']);
    expect(target.list[0]).toBe(edited);
    expect(target.list[1]).toBe(untouched);
  });

  it('rebuilds a string field through its nested edit script', () => {
    const { target, log } = reconcile({ title: 'todo' }, { title: 'todos' });

    expect(target).toEqual({ title: 'todos' });
    expect(log).toEqual(['set title']);
  });

  it('replaces an element whose kind changed', () => {
    const { target } = reconcile({ list: [{ a: 1 }, 2] }, { list: [7, { b: 8 }] } as unknown as {
      list: unknown[];
    });

    expect(target).toEqual({ list: [7, { b: 8 }] });
  });

  it('leaves a pending step unapplied when the target does not mirror the diff', () => {
    // `PENDING` carries no replacement value, so a target that has already diverged is left
    // alone rather than being written something wrong.
    const target = { list: 3 } as unknown as object;
    const changes: Change[] = [[ChangeType.PENDING, 'list', [[ChangeType.UPDATE, 0, 1]]]];

    expect(() => applyChanges(target, changes, createOps().ops)).not.toThrow();
    expect(target).toEqual({ list: 3 });
  });

  it('reaches the target state for every shape the diff can produce', () => {
    const cases: [object, object][] = [
      [{ a: 1 }, { a: 1 }],
      [{ list: [] }, { list: [1, 2, 3] }],
      [{ list: [1, 2, 3] }, { list: [] }],
      [{ list: [1, 2, 3] }, { list: [3, 2, 1] }],
      [{ list: ['a', 'b'] }, { list: ['ab', 'b'] }],
      [{ n: { deep: { deeper: [1] } } }, { n: { deep: { deeper: [1, 2] } } }],
      [{ a: { b: 1 } }, { a: [1] } as unknown as object],
      [{ a: null }, { a: { b: 1 } } as unknown as object],
      [
        { todos: [{ id: '1', title: 'a', tags: ['x'] }], term: 'ab' },
        { todos: [{ id: '1', title: 'ab' }, { id: '2', title: 'b', tags: [] }], term: 'abc' },
      ],
    ];

    for (const [before, after] of cases) expect(reconcile(before, after).target).toEqual(after);
  });
});
