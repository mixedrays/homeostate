import type { StateCreator, StoreMutatorIdentifier } from 'zustand';
import type * as Y from 'yjs';
import {
  createSyncEngine,
  type CrdtBackend,
  type SyncEngineConfig,
} from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';
import { ZustandAdapter } from './adapter.js';

export type HomeostateMiddleware = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  backend: CrdtBackend,
  creator: StateCreator<T, Mps, Mcs>,
  config?: SyncEngineConfig
) => StateCreator<T, Mps, Mcs>;

type HomeostateMiddlewareImpl = <T>(
  backend: CrdtBackend,
  creator: StateCreator<T, [], []>,
  config?: SyncEngineConfig
) => StateCreator<T, [], []>;

const homeostateImpl: HomeostateMiddlewareImpl = (backend, creator, config) => (set, get, api) => {
  const initialState = creator(set, get, api);
  const engine = createSyncEngine(backend, new ZustandAdapter(api, initialState), config);
  engine.connect();
  return api.getState() ?? initialState;
};

/**
 * Zustand middleware that mirrors the store into a CRDT backend for peer-to-peer synchronization.
 *
 * @example
 * const useStore = create(
 *   homeostate(createYjsBackend(new Y.Doc(), 'shared'), (set) => ({ count: 0, increment: () => set((s) => ({ count: s.count + 1 })) }))
 * );
 */
export const homeostate = homeostateImpl as unknown as HomeostateMiddleware;

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

const yjsImpl: YjsMiddlewareImpl = (doc, name, creator) =>
  homeostateImpl(createYjsBackend(doc, name), creator);

/**
 * Zustand middleware that mirrors the store into a Y.Map for peer-to-peer synchronization.
 * Thin wrapper over `homeostate` with a Yjs backend.
 *
 * @example
 * const useStore = create(
 *   yjs(new Y.Doc(), 'shared', (set) => ({ count: 0, increment: () => set((s) => ({ count: s.count + 1 })) }))
 * );
 */
export const yjs = yjsImpl as unknown as YjsMiddleware;
