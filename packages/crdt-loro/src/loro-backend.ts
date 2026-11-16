import type { LoroDoc } from "loro-crdt";
import {
  createCrdtBackend,
  type CrdtBackend,
  type JsonObject,
  type TextPolicy,
} from "@homeostate/core";
import { createLoroOps } from "./patching.js";

/** Options for `createLoroBackend` */
export interface LoroBackendOptions {
  /**
   * Which strings are stored as LoroText, by their path from the synced map, such as
   * `(path) => path[0] === "todos" && path[2] === "title"`. Concurrent edits to a LoroText
   * merge character by character. Every other string is a plain value, and concurrent writes
   * keep one of them whole. Defaults to none.
   */
  text?: TextPolicy;
}

let instances = 0;

export const createLoroBackend = (
  doc: LoroDoc,
  name: string,
  options: LoroBackendOptions = {},
): CrdtBackend => {
  const map = doc.getMap(name);
  const origin = `homeostate:${name}#${instances++}`;

  const ops = createLoroOps(options.text);
  /** How many `transact` calls run; another listener of the first commit may write too. */
  let writing = 0;
  /** The `watch` listeners that heard a change by other code while `transact` ran. */
  const held = new Set<(own: boolean) => void>();

  return createCrdtBackend({
    // `toJSON` builds objects by assignment, so a peer's `__proto__` entry becomes a
    // prototype; the sync engine copies such objects into plain ones before they reach the
    // store.
    read: (): JsonObject => map.toJSON(),

    transact: (edit) => {
      // Edits other code has not committed would join this commit under the backend's origin,
      // unreported, so they are committed first, as their own change. Its event is held until
      // the write lands: a listener that reads the document then sees the write too.
      writing++;
      try {
        doc.commit();
        edit(map, ops);
        doc.commit({ origin });
      } finally {
        writing--;
        if (writing === 0) {
          const missed = [...held];
          held.clear();
          missed.forEach((onChange) => onChange(false));
        }
      }
    },

    watch: (onChange) => {
      const unsubscribe = map.subscribe((event) => {
        const own = event.origin === origin;
        if (writing > 0 && !own) held.add(onChange);
        else onChange(own);
      });
      return () => {
        held.delete(onChange);
        unsubscribe();
      };
    },

    // The document counts every op, committed or not. A checkout changes the state without
    // one.
    revision: () => (doc.isDetached() ? undefined : doc.opCount()),

    text: options.text,
  });
};
