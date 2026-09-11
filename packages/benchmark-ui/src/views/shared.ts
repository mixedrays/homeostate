import type { BenchmarkReport } from '@homeostate/benchmark/types';
import { canUseLog, type ScaleKind } from '../lib/scale';

export interface ViewProps {
  report: BenchmarkReport;
  slots: Map<string, number>;
}

export const SCALE_OPTIONS: Array<{ value: ScaleKind; label: string }> = [
  { value: 'log', label: 'log' },
  { value: 'linear', label: 'linear' },
];

/** The requested scale, or linear when the values include zero or negatives. */
export const effectiveScale = (kind: ScaleKind, values: number[]): { kind: ScaleKind; forced: boolean } =>
  kind === 'log' && !canUseLog(values) ? { kind: 'linear', forced: true } : { kind, forced: false };

export const finite = (values: Array<number | null>): number[] =>
  values.filter((v): v is number => v !== null && Number.isFinite(v));
