import * as Y from 'yjs';
import { LoroDoc } from 'loro-crdt';
import { createMemoryBackend, type MemoryBackend } from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';
import { createLoroBackend } from '@homeostate/crdt-loro';
import type { BackendCandidate, Replica } from './types.js';

const utf8Bytes = (text: string): number => Buffer.byteLength(text);

interface PassthroughReplica extends Replica {
  peers: Set<PassthroughReplica>;
  deliver(next: unknown): void;
}

/**
 * Holds the state by reference and hands the same reference to peers. It has no cost of
 * its own, so its numbers are the engine's own diff, patch, and filter work.
 */
export const passthrough: BackendCandidate<PassthroughReplica> = {
  name: 'passthrough',
  description: 'keeps the state by reference; no cloning, no encoding; measures the engine alone',

  createReplica() {
    let state: unknown = {};
    const listeners = new Set<() => void>();
    const peers = new Set<PassthroughReplica>();

    return {
      peers,
      backend: {
        read: () => state,
        write: (next) => {
          state = next;
          peers.forEach((peer) => peer.deliver(next));
        },
        subscribe: (onRemoteChange) => {
          listeners.add(onRemoteChange);
          return () => {
            listeners.delete(onRemoteChange);
          };
        },
      },
      deliver: (next) => {
        state = next;
        listeners.forEach((listener) => listener());
      },
    };
  },

  connect(a, b) {
    a.peers.add(b);
    b.peers.add(a);
    return {
      disconnect: () => {
        a.peers.delete(b);
        b.peers.delete(a);
      },
    };
  },
};

interface MemoryReplica extends Replica {
  inner: MemoryBackend;
  peers: Set<(payload: string) => void>;
}

/** `createMemoryBackend` from core; peers receive the whole state as a JSON string. */
export const memory: BackendCandidate<MemoryReplica> = {
  name: 'memory',
  description: 'createMemoryBackend from core; the whole state travels as JSON on every write',

  createReplica() {
    const inner = createMemoryBackend();
    const peers = new Set<(payload: string) => void>();

    return {
      inner,
      peers,
      backend: {
        read: inner.read,
        subscribe: inner.subscribe,
        write: (next) => {
          inner.write(next);
          if (peers.size === 0) return;
          const payload = JSON.stringify(next);
          peers.forEach((deliver) => deliver(payload));
        },
      },
      encodedSize: () => utf8Bytes(JSON.stringify(inner.read())),
    };
  },

  connect(a, b) {
    let bytes = 0;
    const link = (target: MemoryReplica) => (payload: string) => {
      bytes += utf8Bytes(payload);
      target.inner.receive(JSON.parse(payload));
    };
    const toB = link(b);
    const toA = link(a);
    a.peers.add(toB);
    b.peers.add(toA);

    return {
      bytes: () => bytes,
      disconnect: () => {
        a.peers.delete(toB);
        b.peers.delete(toA);
      },
    };
  },
};

interface YjsReplica extends Replica {
  doc: Y.Doc;
}

/** `createYjsBackend` over a `Y.Map`; peers exchange Yjs updates. */
export const yjs: BackendCandidate<YjsReplica> = {
  name: 'yjs',
  description: 'createYjsBackend over a Y.Map; peers exchange Yjs updates',

  createReplica() {
    const doc = new Y.Doc();
    return {
      doc,
      backend: createYjsBackend(doc, 'shared'),
      encodedSize: () => Y.encodeStateAsUpdate(doc).byteLength,
      destroy: () => doc.destroy(),
    };
  },

  connect(a, b) {
    const relay = Symbol('wire');
    let bytes = 0;
    const forward = (target: Y.Doc) => (update: Uint8Array, origin: unknown) => {
      if (origin === relay) return;
      bytes += update.byteLength;
      Y.applyUpdate(target, update, relay);
    };
    const toB = forward(b.doc);
    const toA = forward(a.doc);
    a.doc.on('update', toB);
    b.doc.on('update', toA);

    return {
      bytes: () => bytes,
      disconnect: () => {
        a.doc.off('update', toB);
        b.doc.off('update', toA);
      },
    };
  },
};

interface LoroReplica extends Replica {
  doc: LoroDoc;
}

export const loro: BackendCandidate<LoroReplica> = {
  name: 'loro',
  description: 'createLoroBackend over a LoroMap; peers exchange Loro updates; the document is a snapshot',

  createReplica() {
    const doc = new LoroDoc();
    return {
      doc,
      backend: createLoroBackend(doc, 'shared'),
      encodedSize: () => doc.export({ mode: 'snapshot' }).byteLength,
      destroy: () => doc.free(),
    };
  },

  connect(a, b) {
    let bytes = 0;
    const forward = (target: LoroDoc) => (update: Uint8Array): void => {
      bytes += update.byteLength;
      target.import(update);
    };
    const unsubscribeA = a.doc.subscribeLocalUpdates(forward(b.doc));
    const unsubscribeB = b.doc.subscribeLocalUpdates(forward(a.doc));

    return {
      bytes: () => bytes,
      disconnect: () => {
        unsubscribeA();
        unsubscribeB();
      },
    };
  },
};

export const candidates: BackendCandidate[] = [passthrough, memory, yjs, loro];
