import * as Y from "yjs";
import type { CrdtBackend, TextPolicy, Unsubscribe } from "@homeostate/core";
import { toPlainValue } from "./mapping.js";
import { patchSharedType } from "./patching.js";

/** Options for `createYjsBackend` */
export interface YjsBackendOptions {
  /**
   * Which strings are stored as Y.Text, by their path from the synced map, such as
   * `(path) => path[0] === "todos" && path[2] === "title"`. Concurrent edits to a Y.Text merge
   * character by character. Every other string is a plain value, and concurrent writes keep
   * one of them whole. Defaults to none.
   */
  text?: TextPolicy;
}

const noText: TextPolicy = () => false;

/**
 * Creates a CrdtBackend over the Y.Map called `name` inside `doc`.
 *
 * Writes run in a transaction tagged with a private origin, and `subscribe`
 * skips events from that origin, so the engine only hears about remote changes.
 *
 * @example
 * ```typescript
 * const doc = new Y.Doc();
 * const engine = createSyncEngine(createYjsBackend(doc, 'shared'), adapter);
 * engine.connect();
 * ```
 */
export const createYjsBackend = (
  doc: Y.Doc,
  name: string,
  options: YjsBackendOptions = {},
): CrdtBackend => {
  const { text = noText } = options;
  const map = doc.getMap<unknown>(name);
  const origin = Symbol(`homeostate:${name}`);

  return {
    read: () => toPlainValue(map),

    write: (next) => {
      doc.transact(() => patchSharedType(map, next, text), origin);
    },

    subscribe: (onRemoteChange): Unsubscribe => {
      const handler = (_events: unknown, transaction: Y.Transaction): void => {
        if (transaction.origin !== origin) onRemoteChange();
      };
      map.observeDeep(handler);
      return () => map.unobserveDeep(handler);
    },
  };
};
