// For maintainers: this package uses Yjs members its README leaves out, which any 13.x release
// the peer range allows could change:
// - a shared type's `_item`, and that item's `deleted` and `parent`: `isRemoved`,
//   `countTransactions` and `watch`, to find a removed map and the maps a change is inside;
// - `transaction.changed` and the document's `beforeObserverCalls` event: `countTransactions`
//   and `watch`, for `revision` and for a gap that closes;
// - `doc.store.pendingStructs`: `hasGap` in `pending.ts`.
// The tests "a removed map", "an update that waits for an earlier one" and the revision tests
// catch a change to any of them, so run them when raising the Yjs version.
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

/**
 * Whether `map` was deleted from its document. Deleting a map also deletes every type it holds,
 * so this covers a peer replacing any map on the way to it. A root map is never deleted.
 */
const isRemoved = (map: Y.Map<unknown>): boolean => map._item?.deleted === true;

const removedError = (): Error =>
  new Error(
    "The synced Y.Map was removed from its document, as when a peer replaces it with a new map",
  );

/**
 * Throws once `map` is removed. A removed map reads as empty and takes writes no peer sees, so
 * the engine would take a read for a remote change that deleted every key.
 */
const assertPresent = (map: Y.Map<unknown>): void => {
  if (isRemoved(map)) throw removedError();
};

/** A document's transactions, as far as its events tell, for the `revision` of its backends. */
interface Transactions {
  /** Started, whose observers have not been called yet. */
  open: number;
  /**
   * For each synced map, how many transactions changed it or a type inside it, counted when their
   * observers are about to be called, so before any observer hears of a change.
   */
  changes: WeakMap<object, number>;
}

/** A shared type, as far as finding its parent goes. */
type Parent = { _item: Y.Item | null };

/** One count per document, however many backends work on it. */
const counts = new WeakMap<Y.Doc, Transactions>();

/**
 * Counts `doc`'s transactions, and those that changed each synced map. Their changes reach
 * observers only once they end, and a transaction an observer starts ends before the observers
 * still running return, so until a transaction's observers are called, what it changed is
 * unknown. A map is counted from the moment its first backend is created, subscribed or not.
 */
const countTransactions = (doc: Y.Doc): Transactions => {
  const known = counts.get(doc);
  if (known) return known;
  const transactions: Transactions = { open: 0, changes: new WeakMap() };
  doc.on("beforeTransaction", () => {
    transactions.open++;
  });
  doc.on("beforeObserverCalls", (transaction) => {
    // Not below zero, for a transaction already open when the count began.
    transactions.open = Math.max(0, transactions.open - 1);
    // An update the document already held changes nothing.
    if (transaction.changed.size === 0) return;
    // Each changed type and every type holding it, once.
    const touched = new Set<object>();
    for (let at of transaction.changed.keys() as Iterable<Parent | null>) {
      while (at !== null && !touched.has(at)) {
        touched.add(at);
        const count = transactions.changes.get(at);
        if (count !== undefined) transactions.changes.set(at, count + 1);
        // An integrated item's parent is a type.
        at = (at._item?.parent ?? null) as Parent | null;
      }
    }
  });
  counts.set(doc, transactions);
  return transactions;
};

/**
 * Creates a CrdtBackend over the Y.Map called `name` inside `doc`, or over `map`, which may be
 * nested in another shared type or live in a subdocument, but must already be part of a
 * document.
 *
 * Writes run in a transaction tagged with `backend.origin`, and `subscribe` skips events from
 * that origin, so the engine only hears about remote changes.
 *
 * While its document holds an update waiting for an earlier one, a subscribed backend shows the
 * state as the engine last read or wrote it (with `schedule`, at its last flush or write) and
 * reports nothing, then reports one change when the earlier update arrives. See
 * {@link https://homeostate.pages.dev/docs/crdt-yjs/introduction#updates-out-of-order | Updates out of order}.
 *
 * Once a peer removes the map, as by replacing it or a map holding it, `read` and `write` throw.
 * A subscribed backend then reports one change at once, even while an update waits, so that the
 * engine reads and reports the error.
 *
 * @example
 * ```typescript
 * const doc = new Y.Doc();
 * const backend = createYjsBackend(doc, 'shared');
 * const engine = createSyncEngine({ backend, adapter });
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
  const { text } = options;
  // Unique to this backend, since `subscribe` skips every transaction with it.
  const origin = Symbol(`homeostate:${named ? nameOrOptions : "map"}`);
  const transactions = countTransactions(doc);
  // Backends over one map share its count.
  if (!transactions.changes.has(map)) transactions.changes.set(map, 0);
  const changes = (): number => transactions.changes.get(map) ?? 0;
  const hold = createHold(map, doc, changes);

  const ops = createYjsOps(text);

  const backend = createCrdtBackend({
    read: () => {
      assertPresent(map);
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
       * while it was open, one `read` does not show yet, or one made before this watch began,
       * when one is open already.
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
        if (hasGap(doc)) {
          // `read` shows the map as last read or written, which may lack a change reported
          // before the gap and not read yet, as with the engine's `schedule`.
          if (hold.held()?.revision !== changes()) missed = true;
          return;
        }
        if (!missed) return;
        missed = false;
        closing = transaction;
      };
      // For a gap that closes in a transaction that leaves the map alone.
      const reportClosed = (transaction: Y.Transaction): void => {
        if (closing !== transaction) return;
        closing = null;
        onChange(false);
      };
      const nested = map._item !== null;
      let watching = true;
      const unwatch = (): void => {
        if (!watching) return;
        watching = false;
        // A transaction already calling its listeners still calls `reportClosed`, removed or not.
        closing = null;
        map.unobserveDeep(handler);
        doc.off("beforeObserverCalls", watchGap);
        doc.off("afterTransaction", reportClosed);
        if (nested) doc.off("afterTransaction", watchRemoval);
        untrack();
      };
      // Yjs sends a deleted map no event, so look for the removal after every transaction. A
      // removed map never changes again, so the watch ends, and reports once, before a gap that
      // closes later could: the engine then reads, `read` throws, and the engine reports that.
      const watchRemoval = (): void => {
        if (!isRemoved(map)) return;
        unwatch();
        onChange(false);
      };
      map.observeDeep(handler);
      doc.on("beforeObserverCalls", watchGap);
      // Before `reportClosed`, so that a transaction that removes the map and closes a gap is
      // reported once.
      if (nested) doc.on("afterTransaction", watchRemoval);
      doc.on("afterTransaction", reportClosed);
      return unwatch;
    },

    // How many transactions have changed the map, not the rest of the document, so that a change
    // elsewhere does not make the engine read the map; while a gap is open, only the changes
    // `read` shows.
    revision: () => {
      if (transactions.open > 0) return undefined;
      return hold.held()?.revision ?? changes();
    },

    text,
  });

  const write = (next: JsonObjectInput, previous?: JsonObjectInput): void => {
    assertPresent(map);
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
