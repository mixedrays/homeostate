export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

export const focusRing =
  'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export const tableClass = 'w-full border-collapse text-left text-sm tabular-nums';
export const thClass =
  'sticky top-0 whitespace-nowrap border-b border-slate-200 bg-white px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500';
export const tdClass = 'whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-slate-700';
