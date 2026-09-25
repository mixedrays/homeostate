import { describe, expect, it } from 'vitest';
import { garbageCollector, retainedHeap, settledHeap } from '../memory.js';

describe('memory helpers', () => {
  it('obtains a garbage collector without --expose-gc', () => {
    expect(typeof garbageCollector()).toBe('function');
    expect(garbageCollector()).toBe(garbageCollector());
  });

  it('reports a positive settled heap', () => {
    expect(settledHeap()).toBeGreaterThan(0);
  });

  it('attributes retained heap to what the allocation keeps alive', () => {
    const { value, bytes } = retainedHeap(() => new Array(1_000_000).fill(1));
    expect(value).toHaveLength(1_000_000);
    expect(bytes).toBeGreaterThan(1_000_000);
  });
});
