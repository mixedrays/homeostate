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
 * Reads a `DocHandle` as an `AutomergeDocSource`. It listens to `"heads-changed"`: `"change"`
 * skips a merge that moves the heads without changing a value, and the heads are the backend's
 * `revision`. The event does not say where a change came from, so a change is local when `change`
 * produced the document the event reports.
 *
 * One emitter listener calls every subscriber. A subscriber's error is thrown from a timer, as an
 * uncaught error: thrown in the emitter, it would skip the handle's later listeners, its
 * `"change"` event and automerge-repo's sync to peers until the next change.
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
