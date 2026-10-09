import * as A from "@automerge/automerge";

/**
 * Returns a function that copies a value read from an Automerge document into plain JSON,
 * reading `ImmutableString`s as strings. Copies are cached per document object, so unchanged
 * subtrees are shared between calls.
 */
export const createSnapshot = (): ((value: unknown) => unknown) => {
  const copies = new WeakMap<object, unknown>();

  const copy = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (!Array.isArray(value) && A.isImmutableString(value)) return value.val;
    const cached = copies.get(value);
    if (cached !== undefined) return cached;
    const result = Array.isArray(value)
      ? value.map(copy)
      : Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, copy(item)]),
        );
    copies.set(value, result);
    return result;
  };

  return copy;
};
