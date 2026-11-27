import type * as A from "@automerge/automerge";
import type { Unsubscribe } from "@homeostate/core";
import type { AutomergeDocSource, AutomergeHandleEvent } from "./handle.js";

/** What an automerge-repo `DocHandle` reports on `"heads-changed"`. */
export interface AutomergeRepoChange<T> {
  doc: A.Doc<T>;
}

/**
 * The part of an automerge-repo `DocHandle` that `createAutomergeBackend` uses. A `DocHandle`
 * satisfies it, so this package does not depend on automerge-repo.
 */
export interface AutomergeRepoHandle<T> {
  doc(): A.Doc<T>;
  change(fn: A.ChangeFn<T>, options?: A.ChangeOptions<T>): void;
  on(
    event: "heads-changed",
    listener: (change: AutomergeRepoChange<T>) => void,
  ): unknown;
  off(
    event: "heads-changed",
    listener: (change: AutomergeRepoChange<T>) => void,
  ): unknown;
}

/**
 * Reads a `DocHandle` as an `AutomergeDocSource`, on `"heads-changed"`, since `"change"` skips a
 * merge that only moves the heads, the backend's `revision`. A subscriber's error is thrown from a
 * timer: thrown in the emitter, it would skip the handle's later listeners and its sync to peers.
 */
export const fromRepoHandle = <T>(
  docHandle: AutomergeRepoHandle<T>,
): AutomergeDocSource<T> => {
  const changed = new WeakSet<A.Doc<T>>();
  const listeners = new Set<(change: AutomergeHandleEvent<T>) => void>();

  const onChange = ({ doc }: AutomergeRepoChange<T>): void => {
    const change = { doc, local: changed.has(doc) };
    // A copy: as with the emitter, a listener that an earlier one unsubscribes still hears this
    // change.
    for (const listener of [...listeners]) {
      try {
        listener(change);
      } catch (error) {
        setTimeout(() => {
          throw error;
        });
      }
    }
  };

  return {
    doc: () => docHandle.doc(),

    change: (fn) =>
      docHandle.change(fn, {
        patchCallback: (_, { after }) => changed.add(after),
      }),

    subscribe: (listener): Unsubscribe => {
      // Its own entry, so each subscription of one listener is called and unsubscribed apart.
      const entry = (change: AutomergeHandleEvent<T>) => listener(change);
      if (listeners.size === 0) docHandle.on("heads-changed", onChange);
      listeners.add(entry);
      return () => {
        if (!listeners.delete(entry)) return;
        if (listeners.size === 0) docHandle.off("heads-changed", onChange);
      };
    },
  };
};
