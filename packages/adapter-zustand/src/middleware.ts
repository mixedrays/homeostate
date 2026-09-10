import type { StateCreator, StoreMutatorIdentifier } from 'zustand';
import type * as Y from 'yjs';
import {
  createSyncEngine,
  type CrdtBackend,
  type SyncEngine,
  type SyncEngineConfig,
} from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';
import { ZustandAdapter } from './adapter.js';

type Write<T, U> = Omit<T, keyof U> & U;
type WithHomeostate<S, A> = Write<S, { homeostate: A }>;

declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    homeostate: WithHomeostate<S, A>;
  }
}

export type HomeostateMiddleware = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  backend: CrdtBackend,
  creator: StateCreator<T, [...Mps, ['homeostate', SyncEngine]], Mcs>,
  config?: SyncEngineConfig
) => StateCreator<T, Mps, [['homeostate', SyncEngine], ...Mcs]>;

type HomeostateMiddlewareImpl = <T extends object>(
  backend: CrdtBackend,
  creator: StateCreator<T, [], []>,
  config?: SyncEngineConfig
) => StateCreator<T, [], []>;

const homeostateImpl: HomeostateMiddlewareImpl = (backend, creator, config) => (set, get, api) => {
  const initialState = creator(set, get, api);
  api.setState(initialState, true);
  const engine = createSyncEngine(backend, new ZustandAdapter(api), config);
  (api as unknown as { homeostate: SyncEngine }).homeostate = engine;
  engine.connect();
  return api.getState();
};

/**
 * Zustand middleware that mirrors the store into a CRDT backend for peer-to-peer synchronization.
 * The engine is exposed as `store.homeostate`, so `store.homeostate.disconnect()` stops syncing.
 *
 * @example
 * const useStore = create(
 *   homeostate(createYjsBackend(new Y.Doc(), 'shared'), (set) => ({ count: 0, increment: () => set((s) => ({ count: s.count + 1 })) }))
 * );
 */
export const homeostate = homeostateImpl as unknown as HomeostateMiddleware;

export type YjsMiddleware = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  doc: Y.Doc,
  name: string,
  creator: StateCreator<T, [...Mps, ['homeostate', SyncEngine]], Mcs>
) => StateCreator<T, Mps, [['homeostate', SyncEngine], ...Mcs]>;

type YjsMiddlewareImpl = <T extends object>(
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
