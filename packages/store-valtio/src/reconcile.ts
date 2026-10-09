import { getVersion } from "valtio/vanilla";
import { applyChanges, type ApplyOps } from "@homeostate/core";

type Plain = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Plain => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const isProxy = (value: unknown): value is object =>
  getVersion(value) !== undefined;

const clone = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (!isPlainObject(value)) return value;
  const copy: Plain = {};
  for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
  return copy as T;
};

/**
 * Writes into Valtio proxies. Only a proxy is edited in place; any other object, such as a
 * `ref`, is replaced whole. Values are assigned as fresh plain copies so the proxy never wraps a
 * snapshot object, whose non-writable properties would swallow later mutations.
 */
const valtioOps: ApplyOps = {
  kind: (value) =>
    isProxy(value) ? (Array.isArray(value) ? "list" : "record") : undefined,
  get: (container, key) => (container as Plain)[key],
  set: (container, key, value) => {
    (container as Plain)[key] = clone(value);
  },
  remove: (container, key) => {
    delete (container as Plain)[key];
  },
  splice: (list, index, deleteCount, inserted) => {
    (list as unknown[]).splice(index, deleteCount, ...inserted.map(clone));
  },
};

/**
 * Mutates the Valtio proxy `target` so that its snapshot equals `next`, touching only the paths
 * where `next` differs from `current`, the snapshot taken before the call. Removals and inserts
 * splice arrays, so the proxies of the items around them keep their contents.
 */
export const reconcile = (
  target: object,
  current: object,
  next: object,
): void => {
  applyChanges(target, current, next, valtioOps);
};
