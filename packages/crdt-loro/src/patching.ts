import { LoroList, LoroMap, LoroText } from "loro-crdt";
import type { ApplyOps, TextPolicy } from "@homeostate/core";
import { insertListItem, setMapEntry } from "./mapping.js";

/**
 * How `applyChanges` writes into Loro containers, converting values as `setMapEntry` does. A
 * string held as the other kind, text or plain, takes the configured one when it next changes.
 */
export const createLoroOps = (text?: TextPolicy): ApplyOps => ({
  kind: (value) =>
    value instanceof LoroMap
      ? "record"
      : value instanceof LoroList
        ? "list"
        : value instanceof LoroText
          ? "text"
          : undefined,

  get: (container, key) =>
    container instanceof LoroMap
      ? container.get(key as string)
      : (container as LoroList).get(key as number),

  set: (container, key, value, path) => {
    if (container instanceof LoroMap)
      setMapEntry(container, key as string, value, path, text);
    else {
      const list = container as LoroList;
      list.delete(key as number, 1);
      insertListItem(list, key as number, value, path, text);
    }
  },

  remove: (container, key) => {
    (container as LoroMap).delete(key);
  },

  splice: (list, index, deleteCount, inserted, path) => {
    const loroList = list as LoroList;
    if (deleteCount > 0) loroList.delete(index, deleteCount);
    inserted.forEach((value, i) =>
      insertListItem(loroList, index + i, value, path, text),
    );
  },

  editText: (shared, index, deleteCount, inserted) => {
    const loroText = shared as LoroText;
    if (deleteCount > 0) loroText.delete(index, deleteCount);
    if (inserted.length > 0) loroText.insert(index, inserted);
  },
});
