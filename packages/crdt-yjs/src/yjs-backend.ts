import * as Y from "yjs";
import {
  createCrdtBackend,
  type CrdtBackend,
  type JsonObject,
  type JsonObjectInput,
  mergeConcurrent,
  type TextPolicy,
  type Unsubscribe,
} from "@homeostate/core";
import { toPlainMap } from "./mapping.js";
import { createYjsOps } from "./patching.js";
import { copyJson, createHold, hasGap } from "./pending.js";

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
  /**
   * Called once when the synced map is removed from its document, as when a peer replaces it,
   * or a map holding it, with a new map. No peer sees a write to the removed map, so create a
   * backend over the map that replaced it. Only a nested map can be removed, and a backend
   * notices only while subscribed. Defaults to logging the error with `console.error`.
   */
  onRemoved?: (error: Error) => void;
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

// Declared here so that this package needs no Node types; the ES libs have no `console`.
declare const console: { error: (...data: unknown[]) => void };

const reportRemoved = (error: Error): void => {
  console.error("[homeostate] Yjs backend lost its map:", error);
};

/**
 * Whether `map` was deleted from its document. Deleting a map also deletes every type it holds,
 * so this covers a peer replacing any map on the way to it. A root map is never deleted.
 */
const isRemoved = (map: Y.Map<unknown>): boolean => map._item?.deleted === true;

const removedError = (): Error =>
  new Error(
    "The synced Y.Map was removed from its document, as when a peer replaces it with a new map",
  );

/** A document's transactions, as far as its events tell, for the `revision` of its backends. */
interface Transactions {
  /** Started, whose observers have not been called yet. */
  open: number;
  /** Whose observers have been called, and that changed a shared type. */
  done: number;
}

/** One count per document, however many backends work on it. */
const counts = new WeakMap<Y.Doc, Transactions>();

/**
 * Counts `doc`'s transactions. Their changes reach observers only once they end, and a
 * transaction an observer starts ends before the observers still running return, so until a
 * transaction's observers are called, what it changed is unknown.
 */
const countTransactions = (doc: Y.Doc): Transactions => {
  const known = counts.get(doc);
  if (known) return known;
  const transactions: Transactions = { open: 0, done: 0 };
  doc.on("beforeTransaction", () => {
    transactions.open++;
  });
  doc.on("beforeObserverCalls", (transaction) => {
    // Not below zero, for a transaction already open when the count began.
    transactions.open = Math.max(0, transactions.open - 1);
    // An update the document already held changes nothing.
    if (transaction.changed.size > 0) transactions.done++;
  });
  counts.set(doc, transactions);
  return transactions;
};

/**
 * Creates a CrdtBackend over the Y.Map called `name` inside `doc`, or over `map`, which may be
 * nested in another shared type or live in a subdocument, but must already be part of a
 * document.
 *
 * Writes run in a transaction tagged with `origin`, and `subscribe`
 * skips events from that origin, so the engine only hears about remote changes.
 *
 * While subscribed, it shows only states its document passed through. When an update arrives
 * before an earlier one it depends on, Yjs applies the update's deletes and keeps the rest
 * waiting, which would hide a value the update replaces. Until the earlier update arrives,
 * `read` returns what the map held before, `revision` keeps its value, and `subscribe` reports
 * nothing; then it reports the changes at once. Writes meanwhile merge what the store changed
 * into what the document holds, leaving the hidden values alone. The wait covers every change, such as a peer's change to
 * another key, and a gap anywhere in the document, since Yjs tracks waiting updates per
 * document.
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
  map: Y.Map<unknown>,
  options?: YjsBackendOptions,
): YjsBackend;
// Last, so that `Parameters` and other inference from `typeof createYjsBackend` see this form,
// as they did before the map form existed.
/** Creates a CrdtBackend over the Y.Map called `name` inside `doc`. */
export function createYjsBackend(
  doc: Y.Doc,
  name: string,
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
  if (!doc || isRemoved(map))
    throw new TypeError(
      "createYjsBackend needs a Y.Doc and a name, or a Y.Map that is part of a Y.Doc",
    );
  const {
    origin = Symbol(`homeostate:${named ? nameOrOptions : "map"}`),
    onRemoved = reportRemoved,
    text,
  } = options;
  const transactions = countTransactions(doc);
  const hold = createHold(map, doc, () => transactions.done);
  let reported = false;

  const ops = createYjsOps(text);

  const backend = createCrdtBackend({
    read: () => {
      const held = hold.held();
      if (held !== undefined) return copyJson(held.value);
      const value = toPlainMap(map);
      hold.remember(value);
      return value;
    },

    transact: (edit) => doc.transact(() => edit(map, ops), origin),

    watch: (onChange): Unsubscribe => {
      const untrack = hold.track();
      /**
       * Whether a change other than this backend's own may wait for the gap to close: one made
       * while it was open, or before this watch began, when one is open already.
       */
      let missed = hasGap(doc);
      /** The transaction that closed the gap, while its missed changes are unreported. */
      let closing: Y.Transaction | null = null;
      const handler = (_events: unknown, transaction: Y.Transaction): void => {
        const own = transaction.origin === origin;
        if (hasGap(doc)) {
          if (!own) missed = true;
          return;
        }
        const closed = closing === transaction;
        closing = null;
        onChange(own && !closed);
      };
      const watchGap = (transaction: Y.Transaction): void => {
        if (!missed || hasGap(doc)) return;
        missed = false;
        closing = transaction;
      };
      // For a gap that closes in a transaction that leaves the map alone.
      const reportClosed = (transaction: Y.Transaction): void => {
        if (closing !== transaction) return;
        closing = null;
        onChange(false);
      };
      // Yjs sends a deleted map no event, so look for the removal after every transaction.
      const watchRemoval = (): void => {
        if (reported || !isRemoved(map)) return;
        reported = true;
        onRemoved(removedError());
      };
      map.observeDeep(handler);
      doc.on("beforeObserverCalls", watchGap);
      doc.on("afterTransaction", reportClosed);
      const nested = map._item !== null;
      if (nested) doc.on("afterTransaction", watchRemoval);
      return () => {
        map.unobserveDeep(handler);
        doc.off("beforeObserverCalls", watchGap);
        doc.off("afterTransaction", reportClosed);
        if (nested) doc.off("afterTransaction", watchRemoval);
        untrack();
      };
    },

    // Every change in the document, since telling which ones changed the map takes more, but
    // while a gap is open, only the changes `read` shows.
    revision: () => {
      if (transactions.open > 0) return undefined;
      return hold.held()?.revision ?? transactions.done;
    },

    text,
  });

  const write = (next: JsonObjectInput, previous?: JsonObjectInput): void => {
    const held = hold.held();
    if (held === undefined) {
      backend.write(next, previous);
      hold.remember(next);
      return;
    }
    // The store changed what it was shown, which the document no longer holds: an edit script
    // made from it could address items that are gone. So merge what the store changed into what
    // the document holds, leaving alone what it did not change, the values the gap hides too.
    const seen = previous ?? held.value;
    const real = toPlainMap(map);
    backend.write(
      mergeConcurrent(seen, next, real, { text }) as JsonObject,
      real,
    );
    held.value = mergeConcurrent(seen, next, held.value, {
      text,
    }) as JsonObjectInput;
    // Equal to no revision before it, whether or not the write ran inside a transaction.
    held.revision = {};
  };

  return { ...backend, write, map, origin };
}
