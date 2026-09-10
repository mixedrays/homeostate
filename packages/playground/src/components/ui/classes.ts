export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

export const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export const inputBase = cx(
  'w-full rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm transition placeholder:text-slate-400',
  'focus:border-accent-500 focus:outline-none focus:ring-4 focus:ring-accent-500/15'
);

export const buttonPrimary = cx(
  'inline-flex items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 font-medium text-white shadow-sm transition',
  'hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent-600',
  focusRing
);

export const buttonIcon = cx(
  'inline-flex items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700',
  focusRing
);
