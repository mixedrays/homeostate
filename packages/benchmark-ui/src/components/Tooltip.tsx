export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
  muted?: boolean;
}

interface TooltipProps {
  x: number;
  y: number;
  /** Width of the positioned container, to keep the box inside it. */
  width: number;
  title: string;
  rows: TooltipRow[];
}

const BOX = 220;

export function Tooltip({ x, y, width, title, rows }: TooltipProps) {
  const left = x + BOX + 24 > width ? Math.max(0, x - BOX - 12) : x + 12;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100 shadow-lg"
      style={{ left, top: y + 12, width: BOX }}
    >
      <p className="mb-1 font-medium text-white">{title}</p>
      <dl className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="inline-flex min-w-0 items-center gap-1.5 text-slate-300">
              {row.color && <span className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden />}
              <span className="truncate">{row.label}</span>
            </dt>
            <dd className={row.muted ? 'tabular-nums text-slate-400' : 'font-semibold tabular-nums text-white'}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
