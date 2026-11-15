import * as Y from "yjs";
import type { JsonObject, JsonObjectInput } from "@homeostate/core";
import { toPlainMap } from "./mapping.js";

/**
 * Whether `doc` holds structs that wait for an update it has not received, as when a provider
 * delivers a peer's update before an earlier one it depends on. Yjs applies such an update's
 * deletes at once and keeps its structs pending, so a value the update replaces is gone until
 * the earlier update arrives. `pendingStructs` is in Yjs's typings but undocumented. It ignores
 * `pendingDs`, the deletes that wait for their targets, since those hide nothing.
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
 * What a backend shows instead of `map` while the map's document has a gap.
 *
 * - It keeps `known`: the content the backend last read or wrote, with the map's count of
 *   changes at that time. The backend updates it on each read of the map and each write,
 *   whether the hold is tracked or not.
 * - `held()` returns `known` while a gap is open and either the hold is tracked, as while the
 *   backend is subscribed, or `known` is what the map held when the gap opened. Otherwise it
 *   returns `undefined`, and the backend reads the map. So an engine that connects during a gap
 *   reads what the map held before it, not the map with the hole the gap made, unless the map
 *   changed after the backend's last read or write and before the gap.
 * - The hold reads the map itself only when tracking starts, and only if `known` is missing or
 *   behind the map's count, and is not what the map held when an open gap opened. That costs at
 *   most one full read when tracking starts, and none per remote transaction.
 *
 * It takes no copy of the map when a gap opens. With the engine's `schedule`, which delays the
 * engine's read, `known` therefore lacks the remote changes that arrived since the last read or
 * write. The store gets them when the gap closes.
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
