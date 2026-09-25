export type ScaleKind = 'log' | 'linear';

export interface Scale {
  kind: ScaleKind;
  domain: [number, number];
  range: [number, number];
  ticks: number[];
  (value: number): number;
}

export type TickUnit = 'decimal' | 'bytes';

const KIB = 1024;

/** Candidate tick positions for a log axis: decades, or 1 / 10 / 100 of each 1024 order for bytes. */
const logCandidates = (unit: TickUnit, min: number, max: number): number[] => {
  const ticks: number[] = [];
  if (unit === 'bytes') {
    for (let order = 0; order <= 4; order++)
      for (const step of [1, 10, 100]) ticks.push(step * KIB ** order);
  } else {
    const lo = Math.floor(Math.log10(min));
    const hi = Math.ceil(Math.log10(max));
    for (let exponent = lo; exponent <= hi; exponent++) ticks.push(10 ** exponent);
  }
  return ticks;
};

/** Extends `[min, max]` to the surrounding ticks and returns both the domain and the ticks inside it. */
export const logDomain = (
  values: number[],
  unit: TickUnit = 'decimal'
): { domain: [number, number]; ticks: number[] } => {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  if (positive.length === 0) return { domain: [1, 10], ticks: [1, 10] };
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  const candidates = logCandidates(unit, min / 10, max * 10);
  const below = [...candidates].reverse().find((t) => t <= min * 1.0000001) ?? min;
  const above = candidates.find((t) => t >= max / 1.0000001) ?? max;
  const lo = below === above ? below / 10 : below;
  const hi = below === above ? above * 10 : above;
  const ticks = candidates.filter((t) => t >= lo * 0.9999999 && t <= hi * 1.0000001);
  return { domain: [lo, hi], ticks: ticks.length >= 2 ? ticks : [lo, hi] };
};

const niceStep = (span: number, count: number): number => {
  const raw = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return factor * magnitude;
};

/** Linear domain that always includes zero, rounded out to nice tick steps. */
export const linearDomain = (
  values: number[],
  count = 5
): { domain: [number, number]; ticks: number[] } => {
  const finite = values.filter((v) => Number.isFinite(v));
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  if (min === max) return { domain: [0, 1], ticks: [0, 1] };
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.abs(t) < step / 1e6 ? 0 : t);
  return { domain: [lo, hi], ticks };
};

export const makeScale = (
  kind: ScaleKind,
  domain: [number, number],
  ticks: number[],
  range: [number, number]
): Scale => {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const project =
    kind === 'log'
      ? (v: number) => {
          const span = Math.log(d1) - Math.log(d0);
          return span === 0 ? r0 : r0 + ((Math.log(v) - Math.log(d0)) / span) * (r1 - r0);
        }
      : (v: number) => (d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));
  const scale = ((value: number) => project(value)) as Scale;
  scale.kind = kind;
  scale.domain = domain;
  scale.range = range;
  scale.ticks = ticks;
  return scale;
};

/** Builds a scale from raw values; falls back to linear when a log axis cannot show the data. */
export const scaleFor = (
  kind: ScaleKind,
  values: number[],
  range: [number, number],
  unit: TickUnit = 'decimal'
): Scale => {
  if (kind === 'log' && canUseLog(values)) {
    const { domain, ticks } = logDomain(values, unit);
    return makeScale('log', domain, ticks, range);
  }
  const { domain, ticks } = linearDomain(values);
  return makeScale('linear', domain, ticks, range);
};

export const canUseLog = (values: number[]): boolean => {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length > 0 && finite.every((v) => v > 0);
};

/**
 * Least-squares slope of log(y) against log(x): the exponent `k` in `y ∝ x^k`.
 * `null` with fewer than two distinct positive points.
 */
export const logLogSlope = (points: Array<{ x: number; y: number }>): number | null => {
  const usable = points.filter((p) => p.x > 0 && p.y > 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
  const xs = usable.map((p) => Math.log(p.x));
  const ys = usable.map((p) => Math.log(p.y));
  if (new Set(xs).size < 2) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < xs.length; i++) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }
  return numerator / denominator;
};
