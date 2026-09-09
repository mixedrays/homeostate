import type { StateCreator, StoreMutatorIdentifier } from 'zustand';
import type * as Y from 'yjs';
import { createSyncEngine } from '@homeostate/core';
import { ZustandAdapter } from './adapter.js';

export type YjsMiddleware = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  doc: Y.Doc,
  name: string,
  creator: StateCreator<T, Mps, Mcs>
) => StateCreator<T, Mps, Mcs>;

type YjsMiddlewareImpl = <T>(
  doc: Y.Doc,
  name: string,
  creator: StateCreator<T, [], []>
) => StateCreator<T, [], []>;

const yjsImpl: YjsMiddlewareImpl = (doc, name, creator) => (set, get, api) => {
  const initialState = creator(set, get, api);
  const engine = createSyncEngine(doc, new ZustandAdapter(api, initialState), { name });
  engine.connect();
  return initialState;
};

/**
 * Zustand middleware that mirrors the store into a Y.Map for peer-to-peer synchronization.
 *
 * @example
 * const useStore = create(
 *   yjs(new Y.Doc(), 'shared', (set) => ({ count: 0, increment: () => set((s) => ({ count: s.count + 1 })) }))
 * );
 */
export const yjs = yjsImpl as unknown as YjsMiddleware;
