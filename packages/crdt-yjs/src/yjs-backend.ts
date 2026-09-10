import * as Y from 'yjs';
import type { CrdtBackend, Unsubscribe } from '@homeostate/core';
import { patchSharedType } from './patching.js';

export type YjsBackend = CrdtBackend<Y.Map<unknown>>;

/**
 * Creates a CrdtBackend over the Y.Map called `name` inside `doc`.
 *
 * Writes run in a transaction tagged with a private origin, and `subscribe`
 * skips events from that origin, so the engine only hears about remote changes.
 *
 * @example
 * ```typescript
 * const doc = new Y.Doc();
 * const engine = createSyncEngine(createYjsBackend(doc, 'shared'), adapter);
 * engine.connect();
 * ```
 */
export const createYjsBackend = (doc: Y.Doc, name: string): YjsBackend => {
  const map = doc.getMap<unknown>(name);
  const origin = Symbol(`homeostate:${name}`);

  return {
    read: () => map.toJSON(),

    write: (next) => {
      doc.transact(() => patchSharedType(map, next), origin);
    },

    subscribe: (onRemoteChange): Unsubscribe => {
      const handler = (_events: unknown, transaction: Y.Transaction): void => {
        if (transaction.origin !== origin) onRemoteChange();
      };
      map.observeDeep(handler);
      return () => map.unobserveDeep(handler);
    },

    isEmpty: () => map.size === 0,

    native: () => map,
  };
};
