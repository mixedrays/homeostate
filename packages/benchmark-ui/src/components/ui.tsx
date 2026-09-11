import type { ReactNode, SelectHTMLAttributes } from 'react';

import { cx, focusRing } from './classes';

interface SegmentedProps<T extends string | number> {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange(value: NoInfer<T>): void;
}

export function Segmented<T extends string | number>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-md px-2.5 py-1 font-medium transition',
            option.value === value
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-500 hover:text-slate-900',
            focusRing
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        'rounded-lg border border-slate-300 bg-white py-1 pl-2.5 pr-8 text-sm text-slate-900 shadow-sm transition',
        'focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15',
        props.className
      )}
    />
  );
}

interface CardProps {
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, actions, children, className }: CardProps) {
  return (
    <section className={cx('rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5', className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  detail?: ReactNode;
}

export function StatTile({ label, value, detail }: StatTileProps) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
    </div>
  );
}

interface ControlsProps {
  children: ReactNode;
}

/** The single filter row above the content it scopes. */
export function Controls({ children }: ControlsProps) {
  return <div className="flex flex-wrap items-center gap-x-5 gap-y-3">{children}</div>;
}

interface NoteProps {
  children: ReactNode;
}

export function Note({ children }: NoteProps) {
  return <p className="text-xs leading-relaxed text-slate-500">{children}</p>;
}

