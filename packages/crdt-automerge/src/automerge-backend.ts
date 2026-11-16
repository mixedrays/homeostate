import * as A from "@automerge/automerge";
import {
  createCrdtBackend,
  type CrdtBackend,
  type JsonObject,
  type TextPolicy,
  type Unsubscribe,
} from "@homeostate/core";
import type { AutomergeDocSource } from "./handle.js";
import { fromRepoHandle, type AutomergeRepoHandle } from "./repo-handle.js";
import { losingMaps, moveLosingKeys } from "./conflicts.js";
import { createAutomergeOps, isRecord, type Container } from "./patching.js";
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

/** What `value` is, as the error about a synced key holding no map names it. */
const kindOf = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

export const createAutomergeBackend = <T>(
  source: AutomergeDocSource<T> | AutomergeRepoHandle<T>,
  name: string,
  options: AutomergeBackendOptions = {},
): CrdtBackend => {
  // A `DocHandle` has no `subscribe`, while a source of the app's own may also have an `on`.
  const handle = "subscribe" in source ? source : fromRepoHandle(source);
  const snapshot = createSnapshot();
  /** The heads of each document `revision` was asked about. */
  const heads = new WeakMap<object, string>();
  let writing = false;
  /**
   * What `read()` returned before a write moved the keys of losing maps, which it returns until
   * that change ends: reading the document mid-change would show those keys in neither map.
   */
  let beforeMove: JsonObject | undefined;

  // A missing key reads as an empty map, which the first write creates. Maps that lose to the
  // synced map, created by peers that each created it, add the keys it lacks.
  const read = (): JsonObject => {
    const doc = handle.doc() as Container;
    const value = snapshot(doc[name], losingMaps(doc, name));
    if (value === undefined) return {};
    if (isRecord(value)) return value as JsonObject;
    throw new TypeError(
      `The Automerge key ${JSON.stringify(name)} must hold a map, got ${kindOf(value)}`,
    );
  };

  return createCrdtBackend({
    read: () => beforeMove ?? read(),

    transact: (edit) => {
      writing = true;
      try {
        handle.change((doc) => {
          const root = doc as Container;
          const ops = createAutomergeOps(root, name, options.text);
          // The document's own key decides: a write that creates the map diffs against `{}`.
          const created = ops.kind(root[name]) !== "record";
          if (created) root[name] = {};
          // Otherwise the map takes the keys that the maps losing to it add to `read()`.
          const losers = created ? [] : losingMaps(root, name);
          if (losers.length === 0) {
            edit(root[name] as object, ops, created);
            return;
          }
          beforeMove = read();
          try {
            moveLosingKeys(root[name] as Container, losers, options.text);
            edit(root[name] as object, ops, false);
          } finally {
            beforeMove = undefined;
          }
        });
      } finally {
        writing = false;
      }
    },

    watch: (onChange): Unsubscribe =>
      handle.subscribe(({ local }) => {
        // A peer's update merged while the write notifies, as a synchronous relay does, is
        // remote even though it arrives during the write.
        onChange(writing && local);
      }),

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

    text: options.text,
  });
};
