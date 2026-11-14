import * as Y from "yjs";
import type { JsonObject, JsonObjectInput } from "@homeostate/core";
import { toPlainMap } from "./mapping.js";

/**
 * Whether `doc` holds structs that wait for an update it has not received, as when a provider
 * delivers a peer's update before an earlier one it depends on. Yjs applies such an update's
 * deletes at once and keeps its structs pending, so a value the update replaces is gone until
 * the earlier update arrives. `pendingStructs` is in Yjs's typings but undocumented; deletes
 * that wait for their targets, `pendingDs`, hide nothing.
 */
export const hasGap = (doc: Y.Doc): boolean =>
  doc.store.pendingStructs !== null;

/** What a backend shows while its document has a gap. */
export interface Held {
  /** The map's content, as `JSON.stringify` would store it; may hold values it would leave out. */
  value: JsonObjectInput;
  /** The `revision` that goes with it. */
  revision: unknown;
}

/** A copy of `value` as `JSON.stringify` would store it, sharing nothing with it. */
export const copyJson = (value: JsonObjectInput): JsonObject =>
  JSON.parse(JSON.stringify(value), (key, item: unknown) =>
    // Like `toPlainMap`, which never returns this key.
    key === "__proto__" ? undefined : item,
  ) as JsonObject;

/**
 * What `map` held before its document's gap, while one is open. Captures the map's content at
 * the start of every transaction that begins with no gap, and keeps the capture once a
 * transaction leaves one. Reads it only when the map has changed since it last knew the
 * content, from a read or a write of its own, so it costs a read only after a change that came
 * neither way.
 *
 * It follows the document only while tracked, as while the backend is subscribed.
 */
export const createHold = (
  map: Y.Map<unknown>,
  doc: Y.Doc,
  /** How many transactions have changed the map, as before a transaction starts. */
  changes: () => number,
) => {
  let tracked = 0;
  /** The map's content when it had seen `changes` changes. */
  let known: { value: JsonObjectInput; changes: number } | undefined;
  /** What the map held before the transaction that left the gap, or before the current one. */
  let held: Held | undefined;

  const remember = (value: JsonObjectInput): void => {
    if (tracked > 0) known = { value, changes: changes() };
  };

  const content = (): JsonObjectInput => {
    if (known?.changes === changes()) return known.value;
    const value = toPlainMap(map);
    remember(value);
    return value;
  };

  const capture = (): void => {
    if (!hasGap(doc)) held = { value: content(), revision: changes() };
  };

  return {
    /** What to show instead of the map, while its document has a gap and the hold is tracked. */
    held: (): Held | undefined =>
      tracked > 0 && hasGap(doc) ? held : undefined,

    /** Records `value` as the map's content, as just read or written. */
    remember,

    /** Starts following the document, until the returned cleanup is called. */
    track: (): (() => void) => {
      if (tracked++ === 0) {
        // Opened before tracking began, so only what the map holds now is known.
        held = hasGap(doc)
          ? { value: toPlainMap(map), revision: changes() }
          : undefined;
        doc.on("beforeTransaction", capture);
      }
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        if (--tracked > 0) return;
        doc.off("beforeTransaction", capture);
        known = undefined;
        held = undefined;
      };
    },
  };
};
