import type { CrdtBackend, Unsubscribe } from '@homeostate/core';
import type { AutomergeHandle } from './handle.js';
import { applyChanges, diff, toJson, type Container } from './patching.js';
import { createSnapshot } from './snapshot.js';

export const createAutomergeBackend = <T extends Container>(
  handle: AutomergeHandle<T>,
  name: string
): CrdtBackend => {
  const snapshot = createSnapshot();
  let writing = false;

  const current = (): unknown => (handle.doc() as Container)[name];

  return {
    read: () => snapshot(current()) ?? {},

    write: (next) => {
      const changes = diff(current(), next);
      if (changes?.length === 0) return;
      writing = true;
      try {
        handle.change((doc) => {
          if (changes === null) (doc as Container)[name] = toJson(next);
          else applyChanges(doc as Container, [name], changes);
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
