import type { Todo, TodoState } from "./types.js";

/**
 * Structural equality that ignores key order, which differs by backend: `loro` and `automerge`
 * alphabetize keys, the others keep the authored order.
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
 * Surviving rows the receiving store got as new objects, matched by `id` as React matches a keyed
 * list: the upper bound on memoized rows any consumer re-renders. Added and removed rows are not
 * counted; `wasted` rows carry no new data.
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
