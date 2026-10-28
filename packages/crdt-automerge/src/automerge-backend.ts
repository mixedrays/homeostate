import {
  applyChanges,
  toJsonValue,
  type CrdtBackend,
  type TextPolicy,
  type Unsubscribe,
} from "@homeostate/core";
import type { AutomergeHandle } from "./handle.js";
import { fromRepoHandle, type AutomergeRepoHandle } from "./repo-handle.js";
import {
  createAutomergeOps,
  isRecord,
  toAutomerge,
  type Container,
} from "./patching.js";
import { createSnapshot } from "./snapshot.js";

/** Options for `createAutomergeBackend` */
export interface AutomergeBackendOptions {
  /**
   * Which strings are stored as Automerge text, by their path from the synced key, such as
   * `(path) => path[0] === "todos" && path[2] === "title"`. Concurrent edits to text merge
   * character by character. Every other string is an `ImmutableString`, and concurrent writes
   * keep one of them whole. Defaults to none.
   */
  text?: TextPolicy;
}

const noText: TextPolicy = () => false;

export const createAutomergeBackend = <T>(
  source: AutomergeHandle<T> | AutomergeRepoHandle<T>,
  name: string,
  options: AutomergeBackendOptions = {},
): CrdtBackend => {
  const { text = noText } = options;
  const handle = "on" in source ? fromRepoHandle(source) : source;
  const snapshot = createSnapshot();
  let writing = false;

  const current = (): unknown => snapshot((handle.doc() as Container)[name]);

  return {
    read: () => current() ?? {},

    write: (next, previous) => {
      if (!isRecord(next)) return;
      // `current()` is a `read()` snapshot, in which every string is a plain string.
      const before = previous ?? current();
      writing = true;
      try {
        handle.change((doc) => {
          const root = doc as Container;
          const ops = createAutomergeOps(root, name, text);
          // The document's own key decides: `previous` is `{}` when the key is missing.
          if (ops.kind(root[name]) === "record")
            applyChanges(root[name] as object, before as object, next, ops, {
              text,
              json: true,
            });
          else root[name] = toAutomerge(toJsonValue(next), [], text);
        });
      } finally {
        writing = false;
      }
    },

    subscribe: (onRemoteChange): Unsubscribe =>
      handle.subscribe(({ local }) => {
        // A peer's update merged while the write notifies, as a synchronous relay does, is
        // remote even though it arrives during the write.
        if (!writing || !local) onRemoteChange();
      }),
  };
};
