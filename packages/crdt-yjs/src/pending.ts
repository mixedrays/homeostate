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

/** What a backend shows while its document has a gap: the map's content as it last knew it. */
interface Held {
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
 * What `map` held when its backend last read or wrote it, to show while its document has a gap.
 * It takes no copy of the map when a gap opens, so with the engine's `schedule`, which delays
 * its read, it lacks the changes that arrived since that read; the store gets them when the gap
 * closes.
 *
 * It shows it only while tracked, as while the backend is subscribed, and reads the map when
 * tracking starts, unless the last read or write is as recent.
 */
export const createHold = (
  map: Y.Map<unknown>,
  doc: Y.Doc,
  /** How many transactions have changed the map, as before a transaction starts. */
  changes: () => number,
) => {
  let tracked = 0;
  /** The map's content as last read or written, with `changes` as its revision then. */
  let known: Held | undefined;

  const remember = (value: JsonObjectInput): void => {
    known = { value, revision: changes() };
  };

  return {
    /** What to show instead of the map, while its document has a gap and the hold is tracked. */
    held: (): Held | undefined =>
      tracked > 0 && hasGap(doc) ? known : undefined,

    /** Records `value` as the map's content, as just read or written. */
    remember,

    /** Shows what the map held while a gap is open, until the returned cleanup is called, once. */
    track: (): (() => void) => {
      // With a gap open already, what the map holds now is all that is known.
      if (tracked++ === 0 && known?.revision !== changes())
        remember(toPlainMap(map));
      return () => {
        tracked--;
      };
    },
  };
};
