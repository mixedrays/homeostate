import * as Y from "yjs";
import type { JsonObject, JsonObjectInput } from "@homeostate/core";
import { toPlainMap } from "./mapping.js";

/**
 * Whether `doc` holds structs waiting for an earlier update. Yjs applies such an update's deletes
 * at once, so a value it replaces is gone until then. `pendingStructs` is undocumented;
 * `pendingDs` is ignored, since waiting deletes hide nothing.
 */
export const hasGap = (doc: Y.Doc): boolean =>
  doc.store.pendingStructs !== null;

/** What a backend shows while its document has a gap. */
interface Held {
  /**
   * The map's content as the backend last read or wrote it. A write may leave values in it that
   * `JSON.stringify` would leave out, such as `undefined` or a function.
   */
  value: JsonObjectInput;
  /** The `revision` to report while `value` is shown. */
  revision: unknown;
  /**
   * The map's count of changes when `value` was read or written whole. A write during a gap
   * merges into `value` and keeps it.
   */
  readonly from: number;
}

/** A copy of `value` as `JSON.stringify` would store it. It shares no object with `value`. */
export const copyJson = (value: JsonObjectInput): JsonObject =>
  JSON.parse(JSON.stringify(value), (key, item: unknown) =>
    // Left out, as `toPlainMap` leaves it out.
    key === "__proto__" ? undefined : item,
  ) as JsonObject;

/**
 * What a backend shows instead of `map` during a gap: what it last read or wrote. Takes no copy
 * when a gap opens, so with the engine's `schedule`, remote changes since the last read reach the
 * store only when the gap closes.
 */
export const createHold = (
  map: Y.Map<unknown>,
  doc: Y.Doc,
  /** How many transactions have changed the map. A transaction still open is not counted yet. */
  changes: () => number,
  /**
   * While a gap is open, what `changes()` returned when it opened; `undefined` if unknown. Read
   * only while a gap is open.
   */
  changesAtGap: () => number | undefined,
) => {
  let tracked = 0;
  /** The map's content as the backend last read or wrote it; `undefined` before the first. */
  let known: Held | undefined;

  const remember = (value: JsonObjectInput): void => {
    const count = changes();
    known = { value, revision: count, from: count };
  };

  /** Whether a gap is open and `known` is what the map held when it opened. */
  const knownAtGap = (): boolean =>
    known !== undefined && hasGap(doc) && known.from === changesAtGap();

  return {
    /**
     * `known`, while the document has a gap and either the hold is tracked or `known` is what
     * the map held when the gap opened; otherwise `undefined`.
     */
    held: (): Held | undefined =>
      hasGap(doc) && (tracked > 0 || knownAtGap()) ? known : undefined,

    /** Records `value`, just read or written, as the map's content at its current count. */
    remember,

    /**
     * Makes `held()` show what the map held while a gap is open, until the returned cleanup is
     * called. Call the cleanup once.
     */
    track: (): (() => void) => {
      // If a gap is open already and `known` is from after it opened, or behind, the map as it
      // is now is the best content there is.
      if (tracked++ === 0 && known?.revision !== changes() && !knownAtGap())
        remember(toPlainMap(map));
      return () => {
        tracked--;
      };
    },
  };
};
