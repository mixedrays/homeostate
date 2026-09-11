import { describe, expect, it } from 'vitest';
import { contrast, hexToRgb, inkFor, luminance, mix, rgbToHex } from '../lib/color';

describe('color', () => {
  it('round-trips hex', () => {
    expect(hexToRgb('#2a78d6')).toEqual([42, 120, 214]);
    expect(rgbToHex([42, 120, 214])).toBe('#2a78d6');
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });

  it('mixes between the endpoints', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    const mid = luminance(mix('#000000', '#ffffff', 0.5));
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.4);
  });

  it('measures contrast and picks a legible ink', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(inkFor('#0d366b')).toBe('#ffffff');
    expect(inkFor('#cde2fb')).toBe('#0b0b0b');
  });
});
