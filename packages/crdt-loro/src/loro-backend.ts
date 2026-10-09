import type { LoroDoc } from "loro-crdt";
import {
  applyChanges,
  type CrdtBackend,
  type TextPolicy,
  type Unsubscribe,
} from "@homeostate/core";
import { withPlainPrototypes } from "./mapping.js";
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

const noText: TextPolicy = () => false;

let instances = 0;

export const createLoroBackend = (
  doc: LoroDoc,
  name: string,
  options: LoroBackendOptions = {},
): CrdtBackend => {
  const { text = noText } = options;
  const map = doc.getMap(name);
  const origin = `homeostate:${name}#${instances++}`;
  const ops = createLoroOps(text);

  return {
    read: () => withPlainPrototypes(map.toJSON()),

    write: (next) => {
      applyChanges(map, map.toJSON(), next as object, ops, {
        text,
        json: true,
      });
      doc.commit({ origin });
    },

    subscribe: (onRemoteChange): Unsubscribe =>
      map.subscribe((event) => {
        if (event.origin !== origin) onRemoteChange();
      }),
  };
};
