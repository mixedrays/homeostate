import * as Y from "yjs";
import {
  applyChanges,
  type CrdtBackend,
  type TextPolicy,
  type Unsubscribe,
} from "@homeostate/core";
import { toPlainValue } from "./mapping.js";
import { createYjsOps } from "./patching.js";

/** Options for `createYjsBackend` */
export interface YjsBackendOptions {
  /**
   * Which strings are stored as Y.Text, by their path from the synced map, such as
   * `(path) => path[0] === "todos" && path[2] === "title"`. Concurrent edits to a Y.Text merge
   * character by character. Every other string is a plain value, and concurrent writes keep
   * one of them whole. Defaults to none.
   */
  text?: TextPolicy;
  /**
   * The origin of every transaction `write` runs. `subscribe` skips transactions with this
   * origin, so it must be unique to this backend. Defaults to a private Symbol.
   */
  origin?: unknown;
}

/** The `CrdtBackend` `createYjsBackend` returns, with the Yjs objects it works on. */
export interface YjsBackend extends CrdtBackend {
  /** The synced map. */
  readonly map: Y.Map<unknown>;
  /**
   * The origin of every transaction `write` runs, to pass to `Y.UndoManager` as one of its
   * `trackedOrigins`.
   */
  readonly origin: unknown;
}

const noText: TextPolicy = () => false;

/**
 * Creates a CrdtBackend over the Y.Map called `name` inside `doc`, or over `map`, which may be
 * nested in another shared type or live in a subdocument, but must already be part of a
 * document.
 *
 * Writes run in a transaction tagged with `origin`, and `subscribe`
 * skips events from that origin, so the engine only hears about remote changes.
 *
 * @example
 * ```typescript
 * const doc = new Y.Doc();
 * const backend = createYjsBackend(doc, 'shared');
 * const engine = createSyncEngine(backend, adapter);
 * engine.connect();
 * const undo = new Y.UndoManager(backend.map, { trackedOrigins: new Set([backend.origin]) });
 * ```
 */
export function createYjsBackend(
  doc: Y.Doc,
  name: string,
  options?: YjsBackendOptions,
): YjsBackend;
export function createYjsBackend(
  map: Y.Map<unknown>,
  options?: YjsBackendOptions,
): YjsBackend;
export function createYjsBackend(
  source: Y.Doc | Y.Map<unknown>,
  nameOrOptions?: string | YjsBackendOptions,
  docOptions?: YjsBackendOptions,
): YjsBackend {
  // The name tells the forms apart: `instanceof` fails when an app loads two copies of Yjs.
  const named = typeof nameOrOptions === "string";
  const map = named
    ? (source as Y.Doc).getMap<unknown>(nameOrOptions)
    : (source as Y.Map<unknown>);
  const options = (named ? docOptions : nameOrOptions) ?? {};
  const doc = map.doc;
  if (!doc)
    throw new TypeError(
      "createYjsBackend needs a Y.Doc and a name, or a Y.Map that is part of a Y.Doc",
    );
  const {
    text = noText,
    origin = Symbol(`homeostate:${named ? nameOrOptions : "map"}`),
  } = options;
  const ops = createYjsOps(text);

  return {
    map,
    origin,

    read: () => toPlainValue(map),

    write: (next, previous) => {
      // Inside another transaction, its changes so far are reported only once it ends, so
      // `previous` may lack them.
      const current = (
        previous !== undefined && doc._transaction === null
          ? previous
          : map.toJSON()
      ) as object;
      doc.transact(
        () =>
          applyChanges(map, current, next as object, ops, {
            text,
            json: true,
          }),
        origin,
      );
    },

    subscribe: (onRemoteChange): Unsubscribe => {
      const handler = (_events: unknown, transaction: Y.Transaction): void => {
        if (transaction.origin !== origin) onRemoteChange();
      };
      map.observeDeep(handler);
      return () => map.unobserveDeep(handler);
    },
  };
}
