import { ChangeType, type Change } from "./change.js";
import { isAbsent, toJsonValue } from "./json.js";

export type Diffable = Record<string, unknown> | Array<unknown> | string;

/**
 * Decides which strings are collaborative text, by their path from the root of the diffed or
 * synced value: record keys and array indices, such as `["todos", 0, "title"]`.
 *
 * Concurrent edits to text merge character by character, which suits prose such as a title.
 * Any other string is one value, so concurrent writes keep one of them whole, which suits ids,
 * enum-like flags and timestamps.
 */
export type TextPolicy = (path: readonly (string | number)[]) => boolean;

/** Options for `getChanges`. */
export interface DiffOptions {
  /**
   * Which nested strings are diffed character by character. Any other string that changes is
   * replaced whole by one `UPDATE`. Without it, every string is diffed character by character.
   */
  text?: TextPolicy;
  /**
   * Diff `a` and `b` as `JSON.stringify` would store them, without copying either first: object
   * entries holding `undefined` or a function are absent, and such array items, holes included,
   * are `null`. The values the changes carry are passed through `toJsonValue`. A CRDT backend
   * sets it on `write(next, previous)`, so no change it applies holds a value JSON cannot, and
   * none removes an entry its document never held.
   */
  json?: boolean;
}

type Path = (string | number)[];

const isArray = (value: unknown): value is Array<unknown> =>
  Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Whether `key` is an own property of `object`. `in` would also find inherited members such
 * as `constructor`, so a record keyed by user input could never lose a key by that name.
 */
export const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

/**
 * Assigning this key replaces an object's prototype instead of adding a property, so a peer
 * could make properties such as `isAdmin` appear on other users' state. It is never diffed.
 */
export const PROTO_KEY = "__proto__";

const isDiffable = (value: unknown): value is Diffable =>
  isArray(value) || isString(value) || isRecord(value);

const isSameKind = (a: Diffable, b: Diffable): boolean =>
  isString(a) ? isString(b) : isArray(a) ? isArray(b) : isRecord(b);

/**
 * The changes turning `a` into `b` under `key` of the container at `path`, or `null` when `b`
 * replaces `a` whole: a value of another kind, a primitive, or a string that is not text.
 */
const nestedChanges = (
  a: unknown,
  b: unknown,
  path: Path,
  key: string | number,
  options: DiffOptions,
): Change[] | null => {
  if (!isDiffable(a) || !isDiffable(b) || !isSameKind(a, b)) return null;
  const at = [...path, key];
  if (isString(a) && options.text !== undefined && !options.text(at))
    return null;
  return diff(a, b, at, options);
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) return false;
    // A loop, since `every` skips holes.
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return (
      keyCount(keys, a) === keyCount(Object.keys(b), b) &&
      keys.every(
        (key) =>
          key === PROTO_KEY || (hasOwn(b, key) && deepEqual(a[key], b[key])),
      )
    );
  }
  return false;
};

/** The number of `keys` the diff compares, so records equal under `deepEqual` diff to nothing. */
const keyCount = (keys: string[], record: object): number =>
  hasOwn(record, PROTO_KEY) ? keys.length - 1 : keys.length;

/** An array item as `JSON.stringify` stores it. */
const jsonItem = (value: unknown): unknown => (isAbsent(value) ? null : value);

/** `deepEqual` between `a` and `b` as `JSON.stringify` would store them in an object. */
const jsonEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) return false;
    // A loop, since `every` skips holes.
    for (let i = 0; i < a.length; i++)
      if (!jsonItemEqual(a[i], b[i])) return false;
    return true;
  }
  if (isRecord(a) && isRecord(b)) {
    let count = 0;
    for (const key of Object.keys(a)) {
      if (key === PROTO_KEY || isAbsent(a[key])) continue;
      if (!hasOwn(b, key) || !jsonEqual(a[key], b[key])) return false;
      count++;
    }
    // `b` rarely holds absent entries, so its own key count usually settles it.
    return count === Object.keys(b).length || count === jsonKeyCount(b);
  }
  return false;
};

/** `deepEqual` between `a` and `b` as `JSON.stringify` would store them in an array. */
const jsonItemEqual = (a: unknown, b: unknown): boolean =>
  jsonEqual(jsonItem(a), jsonItem(b));

/** The number of entries of `record` that `JSON.stringify` stores and the diff compares. */
const jsonKeyCount = (record: Record<string, unknown>): number => {
  let count = 0;
  for (const key of Object.keys(record))
    if (key !== PROTO_KEY && !isAbsent(record[key])) count++;
  return count;
};

/** A value a change carries: with `options.json`, as JSON would store it. */
const written = (value: unknown, options: DiffOptions): unknown =>
  options.json ? toJsonValue(value) : value;

/**
 * Returns the ordered edit script that turns `a` into `b`. Two strings passed directly are
 * always diffed character by character; `options.text` decides for the strings nested in them.
 */
export const getChanges = (
  a: Diffable,
  b: Diffable,
  options: DiffOptions = {},
): Change[] => diff(a, b, [], options);

const diff = (
  a: Diffable,
  b: Diffable,
  path: Path,
  options: DiffOptions,
): Change[] => {
  if (isString(a) && isString(b)) return getStringChanges(a, b);
  if (isArray(a) && isArray(b)) return getArrayChanges(a, b, path, options);
  if (isRecord(a) && isRecord(b)) return getRecordChanges(a, b, path, options);
  return [];
};

/**
 * The length of the common prefix of two sequences, and of the common suffix of what remains,
 * comparing item `i` of one with item `j` of the other. Edits are usually local, so only the
 * part between them needs an edit script.
 */
const commonEnds = (
  aLength: number,
  bLength: number,
  equal: (i: number, j: number) => boolean,
): [number, number] => {
  const max = Math.min(aLength, bLength);
  let start = 0;
  while (start < max && equal(start, start)) start++;
  let end = 0;
  while (end < max - start && equal(aLength - 1 - end, bLength - 1 - end))
    end++;
  return [start, end];
};

const isHighSurrogate = (code: number): boolean =>
  code >= 0xd800 && code <= 0xdbff;

const isLowSurrogate = (code: number): boolean =>
  code >= 0xdc00 && code <= 0xdfff;

const sharesCharacter = (a: string[], b: string[]): boolean => {
  const characters = new Set(a);
  for (const character of b) if (characters.has(character)) return true;
  return false;
};

const deleteCharacter = (index: number, character: string): Change => [
  ChangeType.DELETE,
  index,
  character.length === 1 ? undefined : character.length,
];

const getStringChanges = (a: string, b: string): Change[] => {
  if (a === b) return [];
  // Trim the common ends by UTF-16 unit, but never between the halves of a surrogate pair.
  let [start, end] = commonEnds(
    a.length,
    b.length,
    (i, j) => a.charCodeAt(i) === b.charCodeAt(j),
  );
  if (start > 0 && isHighSurrogate(a.charCodeAt(start - 1))) start--;
  if (end > 0 && isLowSurrogate(a.charCodeAt(a.length - end))) end--;
  // Compare whole code points, but keep Change offsets in JavaScript's UTF-16 units.
  // Comparing code units can retain half a surrogate pair and corrupt a CRDT text.
  const from = Array.from(a.slice(start, a.length - end));
  const to = Array.from(b.slice(start, b.length - end));
  if (!sharesCharacter(from, to)) {
    const deletes = from.map((character) => deleteCharacter(start, character));
    const inserted = to.join("");
    return inserted.length === 0
      ? deletes
      : [...deletes, [ChangeType.INSERT, start, inserted]];
  }

  const changes: Change[] = [];
  let index = start;

  for (const { step, a: source, b: position } of editScript(
    from,
    to,
    (x, y) => x === y,
  )) {
    if (step === "eq") index += from[source].length;
    else if (step === "del") changes.push(deleteCharacter(index, from[source]));
    else {
      const last = changes.length > 0 ? changes[changes.length - 1] : undefined;
      if (
        last !== undefined &&
        last[0] === ChangeType.INSERT &&
        (last[1] as number) + (last[2] as string).length === index
      ) {
        last[2] = (last[2] as string) + to[position];
      } else changes.push([ChangeType.INSERT, index, to[position]]);
      index += to[position].length;
    }
  }

  return changes;
};

const getArrayChanges = (
  a: Array<unknown>,
  b: Array<unknown>,
  path: Path,
  options: DiffOptions,
): Change[] => {
  const equal = options.json ? jsonItemEqual : deepEqual;
  const [start, end] = commonEnds(a.length, b.length, (i, j) =>
    equal(a[i], b[j]),
  );
  const from = a.slice(start, a.length - end);
  const to = b.slice(start, b.length - end);
  const changes: Change[] = [];
  let index = start;
  let deleted: number[] = [];
  let inserted: number[] = [];
  const itemOf = options.json ? jsonItem : (value: unknown) => value;

  const flush = (): void => {
    const pairs = Math.min(deleted.length, inserted.length);
    for (let i = 0; i < pairs; i++) {
      const next = itemOf(to[inserted[i]]);
      const nested = nestedChanges(
        from[deleted[i]],
        next,
        path,
        index,
        options,
      );
      if (nested === null)
        changes.push([ChangeType.UPDATE, index, written(next, options)]);
      else if (nested.length > 0)
        changes.push([ChangeType.PENDING, index, nested]);
      index++;
    }
    for (let i = pairs; i < deleted.length; i++)
      changes.push([ChangeType.DELETE, index, undefined]);
    for (let i = pairs; i < inserted.length; i++) {
      const next = itemOf(to[inserted[i]]);
      changes.push([ChangeType.INSERT, index, written(next, options)]);
      index++;
    }
    deleted = [];
    inserted = [];
  };

  for (const { step, a: source, b: position } of editScript(from, to, equal)) {
    if (step === "del") deleted.push(source);
    else if (step === "ins") inserted.push(position);
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
  b: Record<string, unknown>,
  path: Path,
  options: DiffOptions,
): Change[] => {
  const changes: Change[] = [];
  // With `options.json`, an entry holding `undefined` or a function is absent.
  const absent = (value: unknown): boolean =>
    options.json === true && isAbsent(value);

  for (const property of Object.keys(a))
    if (
      property !== PROTO_KEY &&
      !absent(a[property]) &&
      (!hasOwn(b, property) || absent(b[property]))
    )
      changes.push([ChangeType.DELETE, property, undefined]);

  for (const [property, value] of Object.entries(b)) {
    if (property === PROTO_KEY || absent(value)) continue;
    if (!hasOwn(a, property) || absent(a[property]))
      changes.push([ChangeType.INSERT, property, written(value, options)]);
    else {
      const nested = nestedChanges(a[property], value, path, property, options);
      if (nested === null) {
        if (a[property] !== value)
          changes.push([ChangeType.UPDATE, property, written(value, options)]);
      } else if (nested.length > 0)
        changes.push([ChangeType.PENDING, property, nested]);
    }
  }

  return changes;
};

interface EditOp {
  step: "eq" | "ins" | "del";
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
  equal: (x: T, y: T) => boolean,
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
      prev:
        fromBelow > fromAbove
          ? pointAt[k + offset - 1]
          : pointAt[k + offset + 1],
    });
  };

  for (let p = 0; furthest[delta + offset] !== n; p++) {
    for (let k = -p; k < delta; k++) snake(k);
    for (let k = delta + p; k > delta; k--) snake(k);
    snake(delta);
  }

  const path: { x: number; y: number }[] = [];
  for (let i = pointAt[delta + offset]; i !== -1; i = points[i].prev)
    path.push(points[i]);

  const ops: EditOp[] = [];
  let x = 0;
  let y = 0;
  const op = (step: EditOp["step"]): EditOp =>
    swapped ? { step, a: y, b: x } : { step, a: x, b: y };

  for (let i = path.length - 1; i >= 0; i--) {
    const end = path[i];
    if (end.y - end.x > y - x) {
      ops.push(op(swapped ? "del" : "ins"));
      y++;
    } else if (end.y - end.x < y - x) {
      ops.push(op(swapped ? "ins" : "del"));
      x++;
    }
    while (x < end.x) {
      ops.push(op("eq"));
      x++;
      y++;
    }
  }

  return ops;
};
