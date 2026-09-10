import { describe, expect, it } from 'vitest';
import { candidates } from '../candidates.js';
import { DEFAULT_SIZES, describeRegistry, parseOptions } from '../options.js';
import { scenarios } from '../scenarios.js';

describe('parseOptions', () => {
  it('defaults to every backend, every scenario, and the standard sizes', () => {
    const options = parseOptions([]);
    expect(options.candidates).toBe(candidates);
    expect(options.scenarios).toBe(scenarios);
    expect(options.sizes).toEqual(DEFAULT_SIZES);
    expect(options).toMatchObject({
      time: 250,
      minSamples: 10,
      operations: 20,
      memory: true,
      json: null,
      compare: null,
      failOn: null,
      threshold: 0.05,
    });
  });

  it('selects backends, scenarios, and sizes by name', () => {
    const options = parseOptions(['-b', 'yjs,memory', '--scenario', 'toggle', '-n', '10,20']);
    expect(options.candidates.map((c) => c.name)).toEqual(['yjs', 'memory']);
    expect(options.scenarios.map((s) => s.name)).toEqual(['toggle']);
    expect(options.sizes).toEqual([10, 20]);
  });

  it('ignores the separator pnpm forwards from `pnpm bench -- <flags>`', () => {
    expect(parseOptions(['--', '--quick']).time).toBe(50);
    expect(() => parseOptions(['stray'])).toThrow(/positional/);
  });

  it('shortens the run with --quick unless overridden', () => {
    expect(parseOptions(['--quick'])).toMatchObject({
      time: 50,
      minSamples: 4,
      operations: 5,
      sizes: [100, 1000],
    });
    expect(parseOptions(['--quick', '-t', '10', '-n', '5'])).toMatchObject({ time: 10, sizes: [5] });
  });

  it('parses output, comparison, and thresholds', () => {
    const options = parseOptions([
      '--json', 'results/a.json',
      '--compare', 'results/b.json',
      '--threshold', '10',
      '--fail-on', '20',
      '--no-memory',
    ]);
    expect(options).toMatchObject({
      json: 'results/a.json',
      compare: 'results/b.json',
      threshold: 0.1,
      failOn: 0.2,
      memory: false,
    });
  });

  it('rejects unknown names and bad numbers with a helpful message', () => {
    expect(() => parseOptions(['-b', 'automerge'])).toThrow(/Unknown backend "automerge"; available: passthrough, memory, yjs/);
    expect(() => parseOptions(['-s', 'nope'])).toThrow(/Unknown scenario "nope"/);
    expect(() => parseOptions(['-n', '0'])).toThrow(/--size expects a positive integer/);
    expect(() => parseOptions(['--fail-on=-1'])).toThrow(/--fail-on expects a non-negative percentage/);
  });

  it('describes the registry with size caps', () => {
    const text = describeRegistry({ candidates, scenarios });
    expect(text).toContain('Backends:');
    expect(text).toMatch(/yjs\s+createYjsBackend/);
    expect(text).toMatch(/replace\s+.*\(up to 1000 todos\)/);
  });
});
