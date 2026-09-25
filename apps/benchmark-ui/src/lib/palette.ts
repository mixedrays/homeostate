/** Categorical slots in fixed order; a backend keeps its slot for the life of the page. */
export const SERIES = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
] as const;

/** Past the eight documented hues a series falls back to the de-emphasis gray. */
export const OTHER = '#898781';

/** Blue, steps 100 to 700, light to dark; the sequential ramp for magnitude grids. */
export const SEQUENTIAL = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
] as const;

export const DIVERGING = {
  low: '#2a78d6',
  mid: '#f0efec',
  high: '#e34948',
} as const;

export const STATUS = {
  good: '#0ca30c',
  goodText: '#006300',
  critical: '#d03b3b',
} as const;

export const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  surface: '#ffffff',
} as const;

export const seriesColor = (slot: number): string => SERIES[slot] ?? OTHER;

export const colorFor = (slots: Map<string, number>, backend: string): string =>
  seriesColor(slots.get(backend) ?? SERIES.length);
