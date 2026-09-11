export const createSnapshot = (): ((value: unknown) => unknown) => {
  const copies = new WeakMap<object, unknown>();

  const copy = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    const cached = copies.get(value);
    if (cached !== undefined) return cached;
    const result = Array.isArray(value)
      ? value.map(copy)
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    copies.set(value, result);
    return result;
  };

  return copy;
};
