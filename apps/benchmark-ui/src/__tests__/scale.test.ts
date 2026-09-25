import { describe, expect, it } from 'vitest';
import { canUseLog, linearDomain, logDomain, logLogSlope, makeScale, scaleFor } from '../lib/scale';

describe('logDomain', () => {
  it('extends to the surrounding decades and lists the ticks between', () => {
    expect(logDomain([0.0042, 2.3])).toEqual({ domain: [0.001, 10], ticks: [0.001, 0.01, 0.1, 1, 10] });
  });

  it('pads a single value by a decade on each side', () => {
    expect(logDomain([1])).toEqual({ domain: [0.1, 10], ticks: [0.1, 1, 10] });
  });

  it('uses 1, 10, 100 of each 1024 order for bytes', () => {
    expect(logDomain([30, 79 * 1024], 'bytes')).toEqual({
      domain: [10, 102400],
      ticks: [10, 100, 1024, 10240, 102400],
    });
  });

  it('ignores zero and negative values', () => {
    expect(logDomain([0, -5, 3]).domain).toEqual([1, 10]);
    expect(logDomain([]).domain).toEqual([1, 10]);
  });
});

describe('linearDomain', () => {
  it('always includes zero and rounds to nice steps', () => {
    expect(linearDomain([12, 47])).toEqual({ domain: [0, 50], ticks: [0, 10, 20, 30, 40, 50] });
  });

  it('spans negatives', () => {
    const { domain, ticks } = linearDomain([-30, 70]);
    expect(domain).toEqual([-40, 80]);
    expect(ticks).toContain(0);
  });
});

describe('scales', () => {
  it('projects logarithmically', () => {
    const scale = makeScale('log', [1, 100], [1, 10, 100], [0, 200]);
    expect(scale(1)).toBe(0);
    expect(scale(10)).toBeCloseTo(100);
    expect(scale(100)).toBeCloseTo(200);
  });

  it('projects linearly with an inverted range', () => {
    const scale = makeScale('linear', [0, 50], [0, 50], [100, 0]);
    expect(scale(0)).toBe(100);
    expect(scale(25)).toBe(50);
  });

  it('falls back to linear when a log axis cannot show the data', () => {
    expect(canUseLog([1, 2])).toBe(true);
    expect(canUseLog([0, 2])).toBe(false);
    expect(scaleFor('log', [0, 2], [0, 1]).kind).toBe('linear');
    expect(scaleFor('log', [1, 2], [0, 1]).kind).toBe('log');
  });
});

describe('logLogSlope', () => {
  it('recovers the exponent of a power law', () => {
    expect(logLogSlope([{ x: 100, y: 1 }, { x: 1000, y: 100 }, { x: 5000, y: 2500 }])).toBeCloseTo(2);
    expect(logLogSlope([{ x: 100, y: 3 }, { x: 1000, y: 3 }])).toBeCloseTo(0);
  });

  it('needs two distinct positive points', () => {
    expect(logLogSlope([{ x: 100, y: 1 }])).toBeNull();
    expect(logLogSlope([{ x: 100, y: 1 }, { x: 100, y: 2 }])).toBeNull();
    expect(logLogSlope([{ x: 100, y: 0 }, { x: 1000, y: 1 }])).toBeNull();
  });
});
