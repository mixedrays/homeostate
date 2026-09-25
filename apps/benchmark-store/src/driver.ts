import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { deepEqual, emptyState, type Scenario } from '@homeostate/benchmark-crdt';
import { resetCounters } from './counters.js';
import { createPair } from './peers.js';
import type { Fixture, RenderResult } from './types.js';

/**
 * Mounts one fixture over a real list of `size` todos, applies one scenario step on the other
 * peer, and reports what React did about it.
 *
 * The counts are the point and they are exact: the same integers on every machine and in
 * every run. The three timings are advisory — React's commit depends on the fixture's DOM and
 * on jsdom, so they are worth reading next to each other and not worth gating a build on.
 */
export const measure = async (
  fixture: Fixture,
  scenario: Scenario,
  size: number
): Promise<RenderResult> => {
  const label = `${fixture.name}/${scenario.name}@${size}`;
  const instance = fixture.create(emptyState());
  const pair = createPair(size, instance.adapter);

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const mountStart = performance.now();
  await act(async () => {
    root.render(instance.tree);
  });
  const mountMs = performance.now() - mountStart;

  // A fixture that memoizes at the wrong level renders fewer components than it has rows, and
  // would then report a flattering number for its adapter. It is wrong, not fast.
  if (instance.counters.row !== size)
    throw new Error(`${label}: mounted ${instance.counters.row} row components for ${size} rows`);
  resetCounters(instance.counters);

  const next = scenario.step(pair.writer.getState(), 0);
  let settled = 0;
  const applyStart = performance.now();
  await act(async () => {
    pair.writer.setState(next);
    settled = performance.now();
  });
  const committed = performance.now();

  // Key order differs between backends, so the check has to be structural, not stringified.
  if (!deepEqual(instance.adapter.getState(), pair.writer.getState()))
    throw new Error(`${label}: the fixture's store did not converge with the writing peer`);

  const { app, searchBox, list, row, footer } = instance.counters;

  await act(async () => {
    root.unmount();
  });
  container.remove();
  pair.destroy();

  return {
    adapter: fixture.name,
    scenario: scenario.name,
    size,
    rowRenders: row,
    listRenders: list,
    searchBoxRenders: searchBox,
    footerRenders: footer,
    appRenders: app,
    applyMs: settled - applyStart,
    commitMs: committed - settled,
    mountMs,
  };
};

export interface RunOptions {
  fixtures: Fixture[];
  scenarios: Scenario[];
  sizes: number[];
  onProgress?(done: number, total: number, label: string): void;
}

/** A scenario that is pathological at scale declares the size it stops being useful at. */
const applies = (scenario: Scenario, size: number): boolean =>
  scenario.maxSize === undefined || size <= scenario.maxSize;

export const countRuns = (options: RunOptions): number =>
  options.sizes.reduce(
    (total, size) =>
      total + options.fixtures.length * options.scenarios.filter((s) => applies(s, size)).length,
    0
  );

export const runRenderBenchmark = async (options: RunOptions): Promise<RenderResult[]> => {
  const total = countRuns(options);
  const results: RenderResult[] = [];
  let done = 0;

  for (const size of options.sizes)
    for (const scenario of options.scenarios) {
      if (!applies(scenario, size)) continue;
      for (const fixture of options.fixtures) {
        results.push(await measure(fixture, scenario, size));
        options.onProgress?.(++done, total, `${size} todos · ${fixture.name} · ${scenario.name}`);
      }
    }

  return results;
};
