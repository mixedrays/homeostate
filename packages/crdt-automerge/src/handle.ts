import * as A from "@automerge/automerge";
import type { Unsubscribe } from "@homeostate/core";

export interface AutomergeHandleEvent<T> {
  doc: A.Doc<T>;
  local: boolean;
}

export interface AutomergeHandle<T = Record<string, unknown>> {
  doc: () => A.Doc<T>;
  change: (fn: A.ChangeFn<T>) => void;
  update: (fn: (doc: A.Doc<T>) => A.Doc<T>) => void;
  subscribe: (
    listener: (event: AutomergeHandleEvent<T>) => void,
  ) => Unsubscribe;
}

/**
 * The part of an `AutomergeHandle` that `createAutomergeBackend` uses, so any object with these
 * methods can hold the document for it. `subscribe` reports every new document, with `local` set
 * when `change` produced it.
 */
export type AutomergeDocSource<T = Record<string, unknown>> = Pick<
  AutomergeHandle<T>,
  "doc" | "change" | "subscribe"
>;

const sameHeads = (a: A.Heads, b: A.Heads): boolean =>
  a.length === b.length && a.every((hash, i) => hash === b[i]);

export const createAutomergeHandle = <T = Record<string, unknown>>(
  initial: A.Doc<T> = A.init<T>(),
): AutomergeHandle<T> => {
  let current = initial;
  const listeners = new Set<(event: AutomergeHandleEvent<T>) => void>();

  const replace = (
    operation: (doc: A.Doc<T>) => A.Doc<T>,
    local: boolean,
  ): void => {
    const before = A.getHeads(current);
    const next = operation(current);
    if (next === current) return;
    current = next;
    if (sameHeads(before, A.getHeads(next))) return;
    const event = { doc: next, local };
    listeners.forEach((listener) => listener(event));
  };

  return {
    doc: () => current,
    change: (fn) => replace((doc) => A.change(doc, fn), true),
    update: (fn) => replace(fn, false),
    subscribe: (listener): Unsubscribe => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
