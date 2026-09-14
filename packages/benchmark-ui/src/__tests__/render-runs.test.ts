import { describe, expect, it } from 'vitest';
import type { RenderReport, RenderResult } from '@homeostate/benchmark-render/types';
import {
  adaptersOf,
  assignAdapterSlots,
  isRenderReport,
  parseRenderReport,
  renderResultAt,
  renderRunLabel,
  renderScenariosOf,
  renderSizesOf,
  sortRenderRuns,
  type RenderRun,
} from '../lib/render-runs';

const result = (adapter: string, scenario: string, size: number, rowRenders: number): RenderResult => ({
  adapter,
  scenario,
  size,
  rowRenders,
  listRenders: 1,
  searchBoxRenders: 0,
  footerRenders: 0,
  appRenders: 0,
  applyMs: 1.5,
  commitMs: 4,
  mountMs: 20,
});

const report = (date = '2026-09-13T11:00:00.000Z'): RenderReport => ({
  meta: { date, node: 'v25.0.0', commit: 'abc1234', dirty: false, versions: { react: '19.3.0' } },
  results: [
    result('redux', 'toggle', 200, 1),
    result('mobx', 'toggle', 200, 200),
    result('redux', 'search', 200, 0),
    result('mobx', 'search', 200, 200),
    result('redux', 'toggle', 1000, 1),
    result('mobx', 'toggle', 1000, 1000),
  ],
});

const run = (id: string, at?: string): RenderRun => ({
  kind: 'render',
  id,
  name: `${id}.json`,
  source: 'file',
  report: report(at),
});

describe('render reports', () => {
  it('accepts what the render benchmark writes', () => {
    expect(isRenderReport(report())).toBe(true);
  });

  it('rejects a backend report, which has operations rather than results', () => {
    expect(isRenderReport({ meta: { date: '2026-09-13' }, replicas: [], operations: [] })).toBe(false);
    expect(isRenderReport({ meta: { date: '2026-09-13' }, results: [{ adapter: 'redux' }] })).toBe(false);
    expect(isRenderReport(null)).toBe(false);
  });

  it('names what is wrong with a file', () => {
    expect(() => parseRenderReport('{')).toThrow('not valid JSON');
    expect(() => parseRenderReport('{"meta":{}}')).toThrow('not a render report');
    expect(parseRenderReport(JSON.stringify(report())).results).toHaveLength(6);
  });

  it('lists adapters and scenarios in run order and sizes ascending', () => {
    expect(adaptersOf(report())).toEqual(['redux', 'mobx']);
    expect(renderScenariosOf(report())).toEqual(['toggle', 'search']);
    expect(renderSizesOf(report())).toEqual([200, 1000]);
  });

  it('finds one cell of the matrix', () => {
    expect(renderResultAt(report(), 1000, 'toggle', 'mobx')?.rowRenders).toBe(1000);
    expect(renderResultAt(report(), 4000, 'toggle', 'mobx')).toBeUndefined();
  });

  it('keeps an adapter on its color slot as runs come and go', () => {
    const first = assignAdapterSlots([run('a')]);
    expect([...first]).toEqual([
      ['redux', 0],
      ['mobx', 1],
    ]);
    expect(assignAdapterSlots([run('b')], first)).toEqual(first);
  });

  it('labels and orders runs newest first', () => {
    const older = run('older', '2026-09-01T00:00:00.000Z');
    const newer = run('newer', '2026-09-12T00:00:00.000Z');
    expect(sortRenderRuns([older, newer]).map((r) => r.id)).toEqual(['newer', 'older']);
    expect(renderRunLabel(newer)).toBe('abc1234 · 2026-09-12 00:00 UTC');
  });
});
