import * as Y from "yjs";
import type { ApplyOps, TextPolicy } from "@homeostate/core";
import { toSharedType } from "./mapping.js";

/**
 * How `applyChanges` writes into Yjs shared types. Every value it writes becomes its shared
 * counterpart per the text policy: strings the policy marks as text are Y.Texts, edited
 * character by character, and any other string is a plain value. A string held as the other
 * kind becomes the configured one when it next changes.
 *
 * @param text Which strings, by path from the synced map, are Y.Texts.
 */
export const createYjsOps = (text: TextPolicy): ApplyOps => ({
  kind: (value) =>
    value instanceof Y.Map
      ? "record"
      : value instanceof Y.Array
        ? "list"
        : value instanceof Y.Text
          ? "text"
          : undefined,

  get: (container, key) =>
    container instanceof Y.Map
      ? container.get(key as string)
      : (container as Y.Array<unknown>).get(key as number),

  set: (container, key, value, path) => {
    const shared = toSharedType(value, [...path, key], text);
    if (container instanceof Y.Map) container.set(key as string, shared);
    else {
      const array = container as Y.Array<unknown>;
      array.delete(key as number);
      array.insert(key as number, [shared]);
    }
  },

  remove: (container, key) => {
    (container as Y.Map<unknown>).delete(key);
  },

  splice: (list, index, deleteCount, inserted, path) => {
    const array = list as Y.Array<unknown>;
    if (deleteCount > 0) array.delete(index, deleteCount);
    if (inserted.length > 0)
      array.insert(
        index,
        inserted.map((value, i) =>
          toSharedType(value, [...path, index + i], text),
        ),
      );
  },

  editText: (shared, index, deleteCount, inserted) => {
    const ytext = shared as Y.Text;
    if (deleteCount > 0) ytext.delete(index, deleteCount);
    if (inserted.length > 0) ytext.insert(index, inserted);
  },
});
