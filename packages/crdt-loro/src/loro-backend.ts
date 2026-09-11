import type { LoroDoc } from 'loro-crdt';
import type { CrdtBackend, Unsubscribe } from '@homeostate/core';
import { patchContainer } from './patching.js';

let instances = 0;

export const createLoroBackend = (doc: LoroDoc, name: string): CrdtBackend => {
  const map = doc.getMap(name);
  const origin = `homeostate:${name}#${instances++}`;

  return {
    read: () => map.toJSON(),

    write: (next) => {
      patchContainer(map, next);
      doc.commit({ origin });
    },

    subscribe: (onRemoteChange): Unsubscribe =>
      map.subscribe((event) => {
        if (event.origin !== origin) onRemoteChange();
      }),
  };
};
