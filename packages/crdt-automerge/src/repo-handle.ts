import type * as A from "@automerge/automerge";
import type { Unsubscribe } from "@homeostate/core";
import type { AutomergeDocSource } from "./handle.js";

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
 */
export const fromRepoHandle = <T>(
  docHandle: AutomergeRepoHandle<T>,
): AutomergeDocSource<T> => {
  const changed = new WeakSet<A.Doc<T>>();

  return {
    doc: () => docHandle.doc(),

    change: (fn) =>
      docHandle.change(fn, {
        patchCallback: (_, { after }) => changed.add(after),
      }),

    subscribe: (listener): Unsubscribe => {
      const onChange = ({ doc }: AutomergeRepoChange<T>) =>
        listener({ doc, local: changed.has(doc) });
      docHandle.on("heads-changed", onChange);
      return () => docHandle.off("heads-changed", onChange);
    },
  };
};
