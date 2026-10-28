import type * as A from "@automerge/automerge";
import type { Unsubscribe } from "@homeostate/core";
import type { AutomergeHandle } from "./handle.js";

/** What an automerge-repo `DocHandle` reports on `"change"`. */
export interface AutomergeRepoChange<T> {
  patchInfo: A.PatchInfo<T>;
}

/**
 * The part of an automerge-repo `DocHandle` that `createAutomergeBackend` uses. A `DocHandle`
 * satisfies it, so this package does not depend on automerge-repo.
 */
export interface AutomergeRepoHandle<T> {
  doc(): A.Doc<T>;
  change(fn: A.ChangeFn<T>, options?: A.ChangeOptions<T>): void;
  on(
    event: "change",
    listener: (change: AutomergeRepoChange<T>) => void,
  ): unknown;
  off(
    event: "change",
    listener: (change: AutomergeRepoChange<T>) => void,
  ): unknown;
}

/**
 * Reads a `DocHandle` as an `AutomergeHandle`. Its `"change"` event does not say where a change
 * came from, so a change is local when `change` produced the document the event reports.
 */
export const fromRepoHandle = <T>(
  docHandle: AutomergeRepoHandle<T>,
): Pick<AutomergeHandle<T>, "doc" | "change" | "subscribe"> => {
  const changed = new WeakSet<A.Doc<T>>();

  return {
    doc: () => docHandle.doc(),

    change: (fn) =>
      docHandle.change(fn, {
        patchCallback: (_, { after }) => changed.add(after),
      }),

    subscribe: (listener): Unsubscribe => {
      const onChange = ({ patchInfo: { after } }: AutomergeRepoChange<T>) =>
        listener({ doc: after, local: changed.has(after) });
      docHandle.on("change", onChange);
      return () => docHandle.off("change", onChange);
    },
  };
};
