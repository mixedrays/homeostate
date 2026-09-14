import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BenchmarkReport, OperationResult, ReplicaResult, Timing } from '@homeostate/benchmark/types';
import type { RenderReport, RenderResult } from '@homeostate/benchmark-render/types';
import { DotPlot } from '../components/DotPlot';
import { LineChart } from '../components/LineChart';
import { assignAdapterSlots, type RenderRun } from '../lib/render-runs';
import { assignSlots, type Run } from '../lib/runs';
import { CompareView } from '../views/CompareView';
import { OperationsView } from '../views/OperationsView';
import { OverviewView } from '../views/OverviewView';
import { RendersView } from '../views/RendersView';
import { ReplicasView } from '../views/ReplicasView';
import { ScalingView } from '../views/ScalingView';

const timing = (mean: number): Timing => ({ mean, p50: mean, p99: mean * 1.5, rme: 1, samples: 20 });

const replica = (backend: string, size: number): ReplicaResult => ({
  backend,
  size,
  seed: timing(backend === 'yjs' ? size / 400 : size / 40000),
  adopt: timing(size / 1000),
  docBytes: backend === 'yjs' ? size * 80 : null,
  heapBytes: size * 2600,
});

const operation = (backend: string, scenario: string, size: number, write: number): OperationResult => ({
  backend,
  scenario,
  size,
  write: timing(write),
  roundtrip: timing(write * 3),
  rendersPerOp: 1,
  wastedPerOp: 0,
  wireBytesPerOp: backend === 'yjs' ? 30 : null,
  docBytesPerOp: backend === 'yjs' ? 30 : null,
  heapBytesPerOp: -512,
});

const report = (yjsToggleAtThousand = 1): BenchmarkReport => ({
  meta: {
    date: '2026-09-10T12:00:00.000Z',
    node: 'v22.0.0',
    commit: 'abc1234',
    dirty: false,
    versions: { yjs: '13.6.27' },
    options: { time: 250, minSamples: 10, operations: 20, sizes: [100, 1000] },
  },
  replicas: [replica('passthrough', 100), replica('yjs', 100), replica('passthrough', 1000), replica('yjs', 1000)],
  operations: [
    operation('passthrough', 'toggle', 100, 0.001),
    operation('yjs', 'toggle', 100, 0.1),
    operation('passthrough', 'toggle-all', 100, 0.01),
    operation('yjs', 'toggle-all', 100, 0.5),
    operation('passthrough', 'toggle', 1000, 0.001),
    operation('yjs', 'toggle', 1000, yjsToggleAtThousand),
  ],
});

const run = (id: string, r: BenchmarkReport): Run => ({ kind: 'backend', id, name: `${id}.json`, source: 'file', report: r });

const current = run('current', report());

const renderResult = (adapter: string, size: number, rowRenders: number): RenderResult => ({
  adapter,
  scenario: 'toggle',
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

const renderRun: RenderRun = {
  kind: 'render',
  id: 'render',
  name: 'render.json',
  source: 'file',
  report: {
    meta: { date: '2026-09-13T11:00:00.000Z', node: 'v25.0.0', commit: 'abc1234', dirty: false, versions: { react: '19.3.0' } },
    results: [
      renderResult('redux', 200, 1),
      renderResult('mobx', 200, 200),
      renderResult('redux', 1000, 1),
      renderResult('mobx', 1000, 1000),
    ],
  } satisfies RenderReport,
};
const slots = assignSlots([current]);
const render = (element: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(element);
const count = (html: string, needle: string): number => html.split(needle).length - 1;

describe('views', () => {
  it('overview shows highlights and the full grid with unmeasured cells', () => {
    const html = render(createElement(OverviewView, { report: current.report, slots }));
    expect(html).toContain('Slowest write');
    expect(html).toContain('toggle-all · yjs · 100 todos');
    expect(html).toContain('Widest gap between backends');
    expect(html).toContain('1,000 todos');
    expect(html).toContain('not measured');
  });

  it('operations lists every figure at the largest size and marks the best write', () => {
    const html = render(createElement(OperationsView, { report: current.report, slots }));
    expect(html).toContain('All figures at 1,000 todos');
    expect(html).toContain('best');
    expect(html).toContain('1.00 ms ±1.0%');
    expect(html).toContain('1,000×');
    expect(html).not.toContain('toggle-all');
  });

  it('scaling fits an exponent per backend', () => {
    const html = render(createElement(ScalingView, { report: current.report, slots }));
    expect(html).toContain('exponent k');
    expect(html).toContain('1.00 (≈ linear)');
    expect(html).toContain('0.00 (flat)');
  });

  it('replicas shows the lifecycle table', () => {
    const html = render(createElement(ReplicasView, { report: current.report, slots }));
    expect(html).toContain('Lifecycle of one replica');
    expect(html).toContain('2.50 ms ±1.0%');
    expect(html).toContain('2.48 MB');
  });

  it('compare asks for a second run, then marks regressions against a baseline', () => {
    const alone = render(
      createElement(CompareView, { current, runs: [current], baselineId: null, onBaselineChange: () => {}, slots })
    );
    expect(alone).toContain('Load a second report');

    const baseline = run('baseline', report(0.5));
    const html = render(
      createElement(CompareView, {
        current,
        runs: [current, baseline],
        baselineId: baseline.id,
        onBaselineChange: () => {},
        slots,
      })
    );
    expect(html).toContain('Regressions');
    expect(html).toContain('+100%');
    expect(html).toContain('500 µs');
    expect(html).toContain('regression beyond the threshold');
  });
});

describe('renders view', () => {
  const html = render(
    createElement(RendersView, {
      run: renderRun,
      runs: [renderRun],
      onRunChange: () => {},
      slots: assignAdapterSlots([renderRun]),
    })
  );

  it('leads with the largest size and both adapters', () => {
    expect(html).toContain('All figures at 1,000 rows');
    expect(html).toContain('redux');
    expect(html).toContain('mobx');
  });

  it('calls out the best and the worst row count against the ideal of one', () => {
    expect(html).toContain('Best row renders');
    expect(html).toContain('Worst row renders');
    expect(html).toContain('one change from a peer should re-render one row');
    expect(html).toContain('100% of the list');
  });

  it('shows the run it is reading', () => {
    expect(html).toContain('render.json');
    expect(html).toContain('react 19.3.0');
  });
});

describe('charts at a fixed width', () => {
  it('draws one dot per measured value and formatted ticks', () => {
    const html = render(
      createElement(DotPlot, {
        width: 640,
        unit: 'duration',
        kind: 'log',
        ariaLabel: 'test',
        rows: [
          {
            key: 'toggle',
            label: 'toggle',
            points: [
              { series: 'passthrough', color: '#2a78d6', value: 0.001, low: 0.0009, high: 0.0011 },
              { series: 'yjs', color: '#eb6834', value: 1 },
              { series: 'missing', color: '#1baf7a', value: null },
            ],
          },
        ],
      })
    );
    expect(count(html, '<circle')).toBe(2);
    expect(html).toContain('1 µs');
    expect(html).toContain('1 ms');
    expect(html).toContain('passthrough 1.0 µs, yjs 1.00 ms, missing —');
  });

  it('draws one line per series over the measured sizes', () => {
    const html = render(
      createElement(LineChart, {
        width: 640,
        xs: [100, 1000],
        xLabel: 'todos',
        unit: 'duration',
        kind: 'log',
        ariaLabel: 'test',
        series: [
          { key: 'a', label: 'a', color: '#2a78d6', points: [{ x: 100, y: 0.1 }, { x: 1000, y: 1 }] },
          { key: 'b', label: 'b', color: '#eb6834', points: [{ x: 100, y: 0.001 }, { x: 1000, y: null }] },
        ],
      })
    );
    expect(count(html, '<path')).toBe(1);
    expect(count(html, '<circle')).toBe(3);
    expect(html).toContain('1,000');
  });
});
