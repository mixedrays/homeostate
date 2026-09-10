import { ChangeType, type Change } from './change.js';

export type Diffable = Record<string, unknown> | Array<unknown> | string;

const isArray = (value: unknown): value is Array<unknown> => Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isDiffable = (value: unknown): value is Diffable =>
  isArray(value) || isString(value) || isRecord(value);

const isSameKind = (a: Diffable, b: Diffable): boolean =>
  isString(a) ? isString(b) : isArray(a) ? isArray(b) : isRecord(b);

const nestedChanges = (a: unknown, b: unknown): Change[] | null =>
  isDiffable(a) && isDiffable(b) && isSameKind(a, b) ? getChanges(a, b) : null;

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (isArray(a) && isArray(b))
    return a.length === b.length && a.every((value, i) => deepEqual(value, b[i]));
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => key in b && deepEqual(a[key], b[key]))
    );
  }
  return false;
};

export const getChanges = (a: Diffable, b: Diffable): Change[] => {
  if (isString(a) && isString(b)) return getStringChanges(a, b);
  if (isArray(a) && isArray(b)) return getArrayChanges(a, b);
  if (isRecord(a) && isRecord(b)) return getRecordChanges(a, b);
  return [];
};

const sharesCharacter = (a: string, b: string): boolean => {
  const characters = new Set(a);
  for (const character of b) if (characters.has(character)) return true;
  return false;
};

const getStringChanges = (a: string, b: string): Change[] => {
  if (a === b) return [];
  if (!sharesCharacter(a, b)) {
    const deletes = Array.from(a, (): Change => [ChangeType.DELETE, 0, undefined]);
    return b.length === 0 ? deletes : [...deletes, [ChangeType.INSERT, 0, b]];
  }

  const changes: Change[] = [];
  let index = 0;

  for (const { step, b: position } of editScript(a, b, (x, y) => x === y)) {
    if (step === 'eq') index++;
    else if (step === 'del') changes.push([ChangeType.DELETE, index, undefined]);
    else {
      const last = changes.length > 0 ? changes[changes.length - 1] : undefined;
      if (
        last !== undefined &&
        last[0] === ChangeType.INSERT &&
        (last[1] as number) + (last[2] as string).length === index
      ) {
        last[2] = (last[2] as string) + b[position];
      } else changes.push([ChangeType.INSERT, index, b[position]]);
      index++;
    }
  }

  return changes;
};

const getArrayChanges = (a: Array<unknown>, b: Array<unknown>): Change[] => {
  const changes: Change[] = [];
  let index = 0;
  let deleted: number[] = [];
  let inserted: number[] = [];

  const flush = (): void => {
    const pairs = Math.min(deleted.length, inserted.length);
    for (let i = 0; i < pairs; i++) {
      const next = b[inserted[i]];
      const nested = nestedChanges(a[deleted[i]], next);
      if (nested === null) changes.push([ChangeType.UPDATE, index, next]);
      else if (nested.length > 0) changes.push([ChangeType.PENDING, index, nested]);
      index++;
    }
    for (let i = pairs; i < deleted.length; i++) changes.push([ChangeType.DELETE, index, undefined]);
    for (let i = pairs; i < inserted.length; i++) {
      changes.push([ChangeType.INSERT, index, b[inserted[i]]]);
      index++;
    }
    deleted = [];
    inserted = [];
  };

  for (const { step, a: from, b: to } of editScript(a, b, deepEqual)) {
    if (step === 'del') deleted.push(from);
    else if (step === 'ins') inserted.push(to);
    else {
      flush();
      index++;
    }
  }
  flush();

  return changes;
};

const getRecordChanges = (
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Change[] => {
  const changes: Change[] = [];

  for (const property of Object.keys(a))
    if (!(property in b)) changes.push([ChangeType.DELETE, property, undefined]);

  for (const [property, value] of Object.entries(b)) {
    if (!(property in a)) changes.push([ChangeType.INSERT, property, value]);
    else {
      const nested = nestedChanges(a[property], value);
      if (nested === null) {
        if (a[property] !== value) changes.push([ChangeType.UPDATE, property, value]);
      } else if (nested.length > 0) changes.push([ChangeType.PENDING, property, nested]);
    }
  }

  return changes;
};

interface EditOp {
  step: 'eq' | 'ins' | 'del';
  a: number;
  b: number;
}

/**
 * Shortest edit script from `a` to `b` by Wu et al.'s O(NP) algorithm. Adapted from
 * https://github.com/cubicdaiya/onp/blob/master/javascript/onp.js.
 */
const editScript = <T>(
  a: ArrayLike<T>,
  b: ArrayLike<T>,
  equal: (x: T, y: T) => boolean
): EditOp[] => {
  const swapped = a.length > b.length;
  const s = swapped ? b : a;
  const t = swapped ? a : b;
  const m = s.length;
  const n = t.length;
  const delta = n - m;
  const offset = m + 1;
  const furthest = new Array<number>(m + n + 3).fill(-1);
  const pointAt = new Array<number>(m + n + 3).fill(-1);
  const points: { x: number; y: number; prev: number }[] = [];

  const snake = (k: number): void => {
    const fromBelow = furthest[k + offset - 1] + 1;
    const fromAbove = furthest[k + offset + 1];
    let y = Math.max(fromBelow, fromAbove);
    let x = y - k;
    while (x < m && y < n && equal(s[x], t[y])) {
      x++;
      y++;
    }
    furthest[k + offset] = y;
    pointAt[k + offset] = points.length;
    points.push({
      x,
      y,
      prev: fromBelow > fromAbove ? pointAt[k + offset - 1] : pointAt[k + offset + 1],
    });
  };

  for (let p = 0; furthest[delta + offset] !== n; p++) {
    for (let k = -p; k < delta; k++) snake(k);
    for (let k = delta + p; k > delta; k--) snake(k);
    snake(delta);
  }

  const path: { x: number; y: number }[] = [];
  for (let i = pointAt[delta + offset]; i !== -1; i = points[i].prev) path.push(points[i]);

  const ops: EditOp[] = [];
  let x = 0;
  let y = 0;
  const op = (step: EditOp['step']): EditOp =>
    swapped ? { step, a: y, b: x } : { step, a: x, b: y };

  for (let i = path.length - 1; i >= 0; i--) {
    const end = path[i];
    if (end.y - end.x > y - x) {
      ops.push(op(swapped ? 'del' : 'ins'));
      y++;
    } else if (end.y - end.x < y - x) {
      ops.push(op(swapped ? 'ins' : 'del'));
      x++;
    }
    while (x < end.x) {
      ops.push(op('eq'));
      x++;
      y++;
    }
  }

  return ops;
};
