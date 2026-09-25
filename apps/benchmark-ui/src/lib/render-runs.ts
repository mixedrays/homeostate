import type { RenderMeta, RenderReport, RenderResult } from '@homeostate/benchmark-store/types';
import type { RunSource } from './runs';

/**
 * A run of the render benchmark. It is a different measurement from the backend matrix — one
 * adapter per row instead of one backend, components counted instead of bytes — so it is kept
 * as its own kind of run rather than squeezed into `BenchmarkReport`.
 */
export interface RenderRun {
  kind: 'render';
  id: string;
  name: string;
  source: RunSource;
  report: RenderReport;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);

const isResult = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.adapter === 'string' &&
  typeof value.scenario === 'string' &&
  typeof value.size === 'number' &&
  isCount(value.rowRenders) &&
  isCount(value.listRenders) &&
  isCount(value.applyMs) &&
  isCount(value.commitMs) &&
  isCount(value.mountMs);

export const isRenderReport = (value: unknown): value is RenderReport =>
  isRecord(value) &&
  isRecord(value.meta) &&
  typeof value.meta.date === 'string' &&
  Array.isArray(value.results) &&
  value.results.every(isResult);

/** Parses a file saved with `pnpm bench:store -- --json`; the error names what is wrong. */
export const parseRenderReport = (text: string): RenderReport => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('not valid JSON');
  }
  if (!isRenderReport(parsed))
    throw new Error('not a render report; expected the JSON written by pnpm bench:store -- --json');
  return parsed;
};

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/** Adapters in the order the benchmark ran them. */
export const adaptersOf = (report: RenderReport): string[] =>
  unique(report.results.map((result) => result.adapter));

export const renderScenariosOf = (report: RenderReport): string[] =>
  unique(report.results.map((result) => result.scenario));

export const renderSizesOf = (report: RenderReport): number[] =>
  unique(report.results.map((result) => result.size)).sort((a, b) => a - b);

export const renderResultAt = (
  report: RenderReport,
  size: number,
  scenario: string,
  adapter: string
): RenderResult | undefined =>
  report.results.find(
    (result) => result.size === size && result.scenario === scenario && result.adapter === adapter
  );

export const renderRunLabel = (run: RenderRun): string => {
  const meta: RenderMeta = run.report.meta;
  const commit = meta.commit === null ? 'unknown commit' : `${meta.commit}${meta.dirty ? '*' : ''}`;
  const date = new Date(meta.date);
  const when = Number.isNaN(date.getTime()) ? meta.date : `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
  return `${commit} · ${when}`;
};

/** Newest first, like the backend runs. */
export const sortRenderRuns = (runs: RenderRun[]): RenderRun[] =>
  [...runs].sort((a, b) => Date.parse(b.report.meta.date) - Date.parse(a.report.meta.date));

/** Stable color slot per adapter across every loaded render run, in first-seen order. */
export const assignAdapterSlots = (
  runs: RenderRun[],
  previous: Map<string, number> = new Map()
): Map<string, number> => {
  const slots = new Map(previous);
  for (const run of runs)
    for (const adapter of adaptersOf(run.report)) if (!slots.has(adapter)) slots.set(adapter, slots.size);
  return slots;
};
