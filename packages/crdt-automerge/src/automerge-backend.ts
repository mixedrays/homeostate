import * as A from "@automerge/automerge";
import {
  applyChanges,
  toJsonValue,
  type CrdtBackend,
  type TextPolicy,
  type Unsubscribe,
} from "@homeostate/core";
import type { AutomergeDocSource } from "./handle.js";
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

/** What `value` is, as the error about a synced key holding no map names it. */
const kindOf = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

export const createAutomergeBackend = <T>(
  source: AutomergeDocSource<T> | AutomergeRepoHandle<T>,
  name: string,
  options: AutomergeBackendOptions = {},
): CrdtBackend => {
  const { text = noText } = options;
  // A `DocHandle` has no `subscribe`, while a source of the app's own may also have an `on`.
  const handle = "subscribe" in source ? source : fromRepoHandle(source);
  const snapshot = createSnapshot();
  /** The heads of each document `revision` was asked about. */
  const heads = new WeakMap<object, string>();
  let writing = false;

  const current = (): unknown => snapshot((handle.doc() as Container)[name]);

  return {
    // A missing key reads as an empty map, which the first write creates.
    read: () => {
      const value = current();
      if (value === undefined) return {};
      if (isRecord(value)) return value;
      throw new TypeError(
        `The Automerge key ${JSON.stringify(name)} must hold a map, got ${kindOf(value)}`,
      );
    },

    // Every change gives the handle a new document, and so does a merge that brings nothing
    // new, which the heads tell apart. They are read once per document.
    revision: () => {
      const doc = handle.doc();
      let known = heads.get(doc);
      if (known === undefined) {
        known = A.getHeads(doc).join();
        heads.set(doc, known);
      }
      return known;
    },

    write: (next, previous) => {
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
