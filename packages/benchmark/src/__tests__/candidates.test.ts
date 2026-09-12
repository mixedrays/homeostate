import { describe, expect, it, vi } from 'vitest';
import {
  automerge,
  candidates,
  loro,
  memory,
  passthrough,
  utf8Bytes,
  yjs,
} from '../candidates.js';
import { makeState } from '../scenarios.js';
import type { BackendCandidate } from '../types.js';

const state = makeState(3);

describe.each(candidates.map((candidate) => [candidate.name, candidate] as const))(
  '%s candidate',
  (_name, candidate: BackendCandidate) => {
    it('reads back what was written', () => {
      const replica = candidate.createReplica();
      expect(replica.backend.read()).toEqual({});
      replica.backend.write(state);
      expect(replica.backend.read()).toEqual(state);
      replica.destroy?.();
    });

    it('delivers writes to a connected replica and notifies its subscriber', () => {
      const a = candidate.createReplica();
      const b = candidate.createReplica();
      const wire = candidate.connect(a, b);
      const onRemoteChange = vi.fn();
      b.backend.subscribe(onRemoteChange);

      a.backend.write(state);

      expect(b.backend.read()).toEqual(state);
      expect(onRemoteChange).toHaveBeenCalledTimes(1);

      wire.disconnect();
      a.backend.write({ ...state, searchTerm: 'after' });
      expect(b.backend.read()).toEqual(state);
    });

    it('does not report its own writes as remote changes', () => {
      const replica = candidate.createReplica();
      const onRemoteChange = vi.fn();
      replica.backend.subscribe(onRemoteChange);
      replica.backend.write(state);
      expect(onRemoteChange).not.toHaveBeenCalled();
    });
  }
);

describe('wire and document accounting', () => {
  it('passthrough has neither a wire format nor a document size', () => {
    const a = passthrough.createReplica();
    const b = passthrough.createReplica();
    expect(a.encodedSize).toBeUndefined();
    expect(passthrough.connect(a, b).bytes).toBeUndefined();
  });

  it('memory counts the JSON payload and sizes the document as JSON', () => {
    const a = memory.createReplica();
    const b = memory.createReplica();
    const wire = memory.connect(a, b);
    a.backend.write(state);
    const json = utf8Bytes(JSON.stringify(state));
    expect(wire.bytes?.()).toBe(json);
    expect(a.encodedSize?.()).toBe(json);
    expect(b.encodedSize?.()).toBe(json);
  });

  it('yjs counts update bytes in both directions and grows the encoded document', () => {
    const a = yjs.createReplica();
    const b = yjs.createReplica();
    const wire = yjs.connect(a, b);
    a.backend.write(state);
    const afterSeed = wire.bytes?.() ?? 0;
    const seededDoc = a.encodedSize?.() ?? 0;
    expect(afterSeed).toBeGreaterThan(0);

    b.backend.write({ ...state, searchTerm: 'x' });
    expect(wire.bytes?.()).toBeGreaterThan(afterSeed);
    expect(a.backend.read()).toEqual({ ...state, searchTerm: 'x' });
    expect(a.encodedSize?.()).toBeGreaterThan(seededDoc);
    a.destroy?.();
    b.destroy?.();
  });

  it('loro counts update bytes in both directions and grows the snapshot', () => {
    const a = loro.createReplica();
    const b = loro.createReplica();
    const wire = loro.connect(a, b);
    a.backend.write(state);
    const afterSeed = wire.bytes?.() ?? 0;
    const seededDoc = a.encodedSize?.() ?? 0;
    expect(afterSeed).toBeGreaterThan(0);

    b.backend.write({ ...state, searchTerm: 'x' });
    expect(wire.bytes?.()).toBeGreaterThan(afterSeed);
    expect(a.backend.read()).toEqual({ ...state, searchTerm: 'x' });
    expect(a.encodedSize?.()).toBeGreaterThan(seededDoc);
    wire.disconnect();
    a.destroy?.();
    b.destroy?.();
  });

  it('automerge counts change bytes in both directions and grows the saved document', () => {
    const a = automerge.createReplica();
    const b = automerge.createReplica();
    const wire = automerge.connect(a, b);
    a.backend.write(state);
    const afterSeed = wire.bytes?.() ?? 0;
    const seededDoc = a.encodedSize?.() ?? 0;
    expect(afterSeed).toBeGreaterThan(0);

    b.backend.write({ ...state, searchTerm: 'x' });
    expect(wire.bytes?.()).toBeGreaterThan(afterSeed);
    expect(a.backend.read()).toEqual({ ...state, searchTerm: 'x' });
    expect(a.encodedSize?.()).toBeGreaterThan(seededDoc);
    wire.disconnect();
    a.destroy?.();
    b.destroy?.();
  });
});
