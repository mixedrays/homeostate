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

  return createCrdtBackend((text) => {
    const ops = createLoroOps(text);
    return {
      // `toJSON` builds objects by assignment, so a peer's `__proto__` entry becomes a
      // prototype; the sync engine copies such objects into plain ones before they reach the
      // store.
      read: (): JsonObject => map.toJSON(),

      transact: (edit) => {
        edit(map, ops);
        doc.commit({ origin });
      },

      watch: (onChange) =>
        map.subscribe((event) => onChange(event.origin === origin)),

      // The document counts every op, committed or not. A checkout changes the state without
      // one.
      revision: () => (doc.isDetached() ? undefined : doc.opCount()),
    };
  }, options);
};
