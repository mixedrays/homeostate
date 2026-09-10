import { describe, expect, it } from 'vitest';
import { defaultSyncFilter } from '../index.js';

describe('defaultSyncFilter', () => {
  it('excludes functions and classes', () => {
    expect(defaultSyncFilter('arrow', () => {})).toBe(false);
    expect(defaultSyncFilter('named', function named() {})).toBe(false);
    expect(defaultSyncFilter('cls', class {})).toBe(false);
  });

  it('keeps every other value regardless of the key', () => {
    for (const value of [0, 1, '', 'text', false, true, null, undefined, [], [1], {}, { a: 1 }]) {
      expect(defaultSyncFilter('key', value)).toBe(true);
    }
  });
});
