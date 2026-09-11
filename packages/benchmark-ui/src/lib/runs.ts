import type {
  BenchmarkMeta,
  BenchmarkReport,
  OperationResult,
  ReplicaResult,
} from '@homeostate/benchmark/types';

export type RunSource = 'results' | 'file';

export interface Run {
  id: string;
  /** File name the report came from. */
  name: string;
  source: RunSource;
  report: BenchmarkReport;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTiming = (value: unknown): boolean =>
  isRecord(value) && ['mean', 'p50', 'p99', 'rme', 'samples'].every((k) => typeof value[k] === 'number');

const isBytes = (value: unknown): boolean => value === null || typeof value === 'number';

const isReplica = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.backend === 'string' &&
  typeof value.size === 'number' &&
  isTiming(value.seed) &&
  isTiming(value.adopt) &&
  isBytes(value.docBytes) &&
  isBytes(value.heapBytes);

const isOperation = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.backend === 'string' &&
  typeof value.scenario === 'string' &&
  typeof value.size === 'number' &&
  isTiming(value.write) &&
  isTiming(value.roundtrip) &&
  isBytes(value.wireBytesPerOp) &&
  isBytes(value.docBytesPerOp) &&
  isBytes(value.heapBytesPerOp);

export const isReport = (value: unknown): value is BenchmarkReport =>
  isRecord(value) &&
  isRecord(value.meta) &&
  typeof value.meta.date === 'string' &&
  Array.isArray(value.replicas) &&
  value.replicas.every(isReplica) &&
  Array.isArray(value.operations) &&
  value.operations.every(isOperation);

/** Parses a file saved with `pnpm bench -- --json`; the error names what is wrong. */
export const parseReport = (text: string): BenchmarkReport => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('not valid JSON');
  }
  if (!isReport(parsed))
    throw new Error('not a benchmark report; expected the JSON written by pnpm bench -- --json');
  return parsed;
};

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/** Sizes measured in the report, ascending. */
export const sizesOf = (report: BenchmarkReport): number[] =>
  unique([...report.replicas, ...report.operations].map((r) => r.size)).sort((a, b) => a - b);

/** Backends in the order the harness ran them. */
export const backendsOf = (report: BenchmarkReport): string[] =>
  unique([...report.replicas, ...report.operations].map((r) => r.backend));

/** Scenarios in the order the harness ran them. */
export const scenariosOf = (report: BenchmarkReport): string[] =>
  unique(report.operations.map((o) => o.scenario));

export const operationAt = (
  report: BenchmarkReport,
  size: number,
  scenario: string,
  backend: string
): OperationResult | undefined =>
  report.operations.find((o) => o.size === size && o.scenario === scenario && o.backend === backend);

export const replicaAt = (
  report: BenchmarkReport,
  size: number,
  backend: string
): ReplicaResult | undefined =>
  report.replicas.find((r) => r.size === size && r.backend === backend);

export const shortCommit = (meta: BenchmarkMeta): string =>
  meta.commit === null ? 'unknown commit' : `${meta.commit}${meta.dirty ? '*' : ''}`;

export const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};

export const runLabel = (run: Run): string => `${shortCommit(run.report.meta)} · ${formatDate(run.report.meta.date)}`;

/** Newest first; ties keep insertion order. */
export const sortRuns = (runs: Run[]): Run[] =>
  [...runs].sort((a, b) => Date.parse(b.report.meta.date) - Date.parse(a.report.meta.date));

/**
 * Stable slot per backend across every loaded run, in first-seen order, so a backend keeps
 * its color when runs are added or removed.
 */
export const assignSlots = (runs: Run[], previous: Map<string, number> = new Map()): Map<string, number> => {
  const slots = new Map(previous);
  for (const run of runs)
    for (const backend of backendsOf(run.report)) if (!slots.has(backend)) slots.set(backend, slots.size);
  return slots;
};

export const fileStem = (name: string): string => name.replace(/\.json$/i, '');
