import {
  compareReports,
  isImprovement,
  isRegression,
  type Comparison,
  type ComparisonRow,
  type MetricDelta,
} from "@homeostate/benchmark-crdt/report";
import type { BenchmarkMeta } from "@homeostate/benchmark-crdt/types";
import type { Metric } from "./metrics";
import {
  backendsOf,
  scenariosOf,
  shortCommit,
  sizesOf,
  type Run,
} from "./runs";

/** When the measured code was written: the commit date, or the run date for a report without one. */
export const writtenAt = (meta: BenchmarkMeta): string =>
  meta.commitDate ?? meta.date;

const time = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Oldest first by commit date, so a run made today of an older commit falls into place; runs
 * of one commit keep the order they were made in.
 */
export const chronological = (runs: Run[]): Run[] =>
  [...runs].sort(
    (a, b) =>
      time(writtenAt(a.report.meta)) - time(writtenAt(b.report.meta)) ||
      time(a.report.meta.date) - time(b.report.meta.date),
  );

/** Short x-axis label: the commit, or the run date when the report has none. */
export const tickLabel = (run: Run): string =>
  run.report.meta.commit === null
    ? run.report.meta.date.slice(0, 10)
    : shortCommit(run.report.meta);

const union = <T>(lists: T[][]): T[] => [...new Set(lists.flat())];

/** Sizes measured by any of the runs, ascending. */
export const sizesAcross = (runs: Run[]): number[] =>
  union(runs.map((run) => sizesOf(run.report))).sort((a, b) => a - b);

/** Backends of any of the runs, in first-seen order. */
export const backendsAcross = (runs: Run[]): string[] =>
  union(runs.map((run) => backendsOf(run.report)));

/** Scenarios of any of the runs, in first-seen order. */
export const scenariosAcross = (runs: Run[]): string[] =>
  union(runs.map((run) => scenariosOf(run.report)));

/** One metric read from one run; `spread` is mean ± margin of error for timings. */
export interface Reading {
  value: number | null;
  spread: [number, number] | null;
}

export const read = <Row>(
  metric: Metric<Row>,
  row: Row | undefined,
): Reading =>
  row === undefined
    ? { value: null, spread: null }
    : {
        value: metric.value(row) ?? null,
        spread: metric.spread?.(row) ?? null,
      };

/** `value` as a change from `base`; `null` when either is missing or `base` is zero. */
export const relativeTo = (
  base: number | null,
  value: number | null,
): number | null =>
  base === null ||
  value === null ||
  base === 0 ||
  !Number.isFinite(base) ||
  !Number.isFinite(value)
    ? null
    : (value - base) / Math.abs(base);

/**
 * Readings as a change from the first one with a value, so series of any magnitude share one
 * axis. A series that starts at zero has no relative change and comes back empty.
 */
export const rebase = (readings: Reading[]): Reading[] => {
  const base =
    readings.find((reading) => reading.value !== null)?.value ?? null;
  return readings.map((reading) => {
    const value = relativeTo(base, reading.value);
    const [low, high] = reading.spread
      ? reading.spread.map((bound) => relativeTo(base, bound))
      : [null, null];
    return {
      value,
      spread:
        value !== null && low !== null && high !== null ? [low, high] : null,
    };
  });
};

/** A significant change between two runs, with the row it belongs to. */
export interface Change {
  row: ComparisonRow;
  delta: MetricDelta;
}

/** Two consecutive runs and what changed between them. */
export interface Step {
  from: Run;
  to: Run;
  comparison: Comparison;
  /** Largest first; growth from zero ranks above any percentage. */
  regressions: Change[];
  improvements: Change[];
}

const magnitude = (delta: MetricDelta): number =>
  Number.isNaN(delta.change) ? Infinity : Math.abs(delta.change);

const largestFirst = (a: Change, b: Change): number =>
  magnitude(b.delta) - magnitude(a.delta) || 0;

/** `compareReports` between each run and the one before it, with the rule of the Compare tab. */
export const stepsOf = (runs: Run[], threshold: number): Step[] =>
  runs.slice(1).map((to, index) => {
    const from = runs[index];
    const comparison = compareReports(from.report, to.report, threshold);
    const changes = comparison.rows.flatMap((row) =>
      row.deltas.map((delta) => ({ row, delta })),
    );
    return {
      from,
      to,
      comparison,
      regressions: changes
        .filter((change) => isRegression(change.delta))
        .sort(largestFirst),
      improvements: changes
        .filter((change) => isImprovement(change.delta))
        .sort(largestFirst),
    };
  });

/** One metric of one comparison row; `scenario` is `null` for a replica row. */
export const deltaAt = (
  comparison: Comparison,
  size: number,
  scenario: string | null,
  backend: string,
  metric: string,
): MetricDelta | undefined =>
  comparison.rows
    .find(
      (row) =>
        row.size === size &&
        row.scenario === scenario &&
        row.backend === backend,
    )
    ?.deltas.find((delta) => delta.metric === metric);

export const describeChange = ({ row, delta }: Change): string =>
  `${delta.metric} · ${row.scenario ?? "replica"} · ${row.backend} · ${row.size.toLocaleString("en-US")} todos`;
