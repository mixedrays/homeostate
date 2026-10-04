import {
  toJsonValue,
  type CrdtBackend,
  type TextPolicy,
  type Unsubscribe,
} from "@homeostate/core";
import type { AutomergeHandle } from "./handle.js";
import { applyChanges, diff, toAutomerge, type Container } from "./patching.js";
import { createSnapshot } from "./snapshot.js";

/** Options for `createAutomergeBackend` */
export interface AutomergeBackendOptions {
  /**
   * Which strings are stored as Automerge text, by their path from the synced key, such as
   * `(path) => path[0] === "todos" && path[2] === "title"`. Concurrent edits to text merge
   * character by character. Every other string is an `ImmutableString`, and concurrent writes
   * keep one of them whole. Defaults to none.
   */
  text?: TextPolicy;
}

const noText: TextPolicy = () => false;

export const createAutomergeBackend = <T extends Container>(
  handle: AutomergeHandle<T>,
  name: string,
  options: AutomergeBackendOptions = {},
): CrdtBackend => {
  const { text = noText } = options;
  const snapshot = createSnapshot();
  let writing = false;

  const current = (): unknown => snapshot((handle.doc() as Container)[name]);

  return {
    read: () => current() ?? {},

    write: (next) => {
      const value = toJsonValue(next);
      const changes = diff(current(), value, text);
      if (changes?.length === 0) return;
      writing = true;
      try {
        handle.change((doc) => {
          if (changes === null)
            (doc as Container)[name] = toAutomerge(value, [], text);
          else applyChanges(doc as Container, name, [], changes, text);
        });
      } finally {
        writing = false;
      }
    },

    subscribe: (onRemoteChange): Unsubscribe =>
      handle.subscribe(() => {
        if (!writing) onRemoteChange();
      }),
  };
};
