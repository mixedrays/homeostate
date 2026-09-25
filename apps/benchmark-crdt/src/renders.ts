import type { Todo, TodoState } from "./types.js";

/**
 * Structural equality that ignores the order of object keys. Backends disagree on it:
 * `passthrough`, `memory` and `yjs` return a todo with its authored key order
 * (`id, title, completed`) while `loro` and `automerge` alphabetize it
 * (`completed, id, title`), so `JSON.stringify` reports a difference where there is none.
 */
export const deepEqual = (x: unknown, y: unknown): boolean => {
  if (x === y) return true;
  if (Array.isArray(x) && Array.isArray(y))
    return (
      x.length === y.length && x.every((value, i) => deepEqual(value, y[i]))
    );
  if (
    x !== null &&
    y !== null &&
    typeof x === "object" &&
    typeof y === "object"
  ) {
    const a = x as Record<string, unknown>;
    const b = y as Record<string, unknown>;
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => deepEqual(a[key], b[key]))
    );
  }
  return false;
};

export interface RenderCount {
  /** Rows that survived the operation and whose object reference changed. */
  renders: number;
  /** Of those, the rows whose data is deep-equal, so the re-render bought nothing. */
  wasted: number;
}

/**
 * Counts what one operation costs the receiving peer's UI, as the strict upper bound on how
 * many memoized row components any correct consumer can re-render. Rows are matched by `id`,
 * the way React reconciles a keyed list: `applyChangesToArray` splices, which moves existing
 * references, so matching by index reports a change for every row after an insert or a delete
 * even though the components themselves keep their data.
 *
 * A row the operation added is not counted — it has to mount whatever core does. A row that
 * disappeared is not counted either. What is counted is a surviving row handed to the store
 * as a new object, which is exactly what structural sharing in `patchState` is there to
 * prevent, and `wasted` is the part of that which carries no new data at all.
 */
export const countRenders = (
  before: TodoState,
  after: TodoState,
): RenderCount => {
  const previous = new Map<string, Todo>(
    before.todos.map((todo) => [todo.id, todo]),
  );
  let renders = 0;
  let wasted = 0;

  for (const row of after.todos) {
    const old = previous.get(row.id);
    if (old === undefined || old === row) continue;
    renders++;
    if (deepEqual(old, row)) wasted++;
  }

  return { renders, wasted };
};
