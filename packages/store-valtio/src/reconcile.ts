import { getVersion } from 'valtio/vanilla';

type Plain = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Plain => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const isProxy = (value: unknown): value is object => getVersion(value) !== undefined;

const clone = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (!isPlainObject(value)) return value;
  const copy: Plain = {};
  for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
  return copy as T;
};

const sameKind = (a: unknown, b: unknown): boolean =>
  (Array.isArray(a) && Array.isArray(b)) || (isPlainObject(a) && isPlainObject(b));

/**
 * Mutates the Valtio proxy `target` so that its snapshot equals `next`, touching only
 * the paths where `next` differs from `current`, the snapshot taken before the call.
 * Changed subtrees are assigned as fresh plain copies so the proxy never wraps a
 * snapshot object, whose non-writable properties would swallow later mutations.
 */
export const reconcile = (target: object, current: object, next: object): void => {
  const dest = target as Plain;
  const prev = current as Plain;
  const keys = Array.isArray(next)
    ? Array.from({ length: next.length }, (_, i) => String(i))
    : Object.keys(next);

  for (const key of keys) {
    const value = (next as Plain)[key];
    if (key in prev && Object.is(prev[key], value)) continue;

    const previous = prev[key];
    const child = dest[key];
    if (sameKind(previous, value) && isProxy(child)) {
      reconcile(child, previous as object, value as object);
    } else {
      dest[key] = clone(value);
    }
  }

  if (Array.isArray(next)) {
    const array = target as unknown[];
    if (array.length > next.length) array.splice(next.length);
  } else {
    for (const key of Object.keys(prev)) {
      if (!(key in next)) delete dest[key];
    }
  }
};
