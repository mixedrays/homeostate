import { useState, type PointerEvent, type ReactNode } from 'react';
import { useMeasure } from '../hooks/useMeasure';
import { Tooltip, type TooltipRow } from './Tooltip';

export interface HeatCell {
  text: string;
  fill: string;
  ink: string;
  rows: TooltipRow[];
}

export interface HeatColumn {
  key: string;
  label: string;
}

export interface HeatGroup {
  key: string;
  label: string;
  columns: HeatColumn[];
}

export interface HeatRow {
  key: string;
  label: string;
}

interface HeatmapProps {
  rows: HeatRow[];
  groups: HeatGroup[];
  cell(row: HeatRow, group: HeatGroup, column: HeatColumn): HeatCell | null;
  ariaLabel: string;
  legend?: ReactNode;
}

interface Hover {
  title: string;
  rows: TooltipRow[];
  x: number;
  y: number;
}

/** A grid of colored cells with the value printed in each; the color carries the same number. */
export function Heatmap({ rows, groups, cell, ariaLabel, legend }: HeatmapProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);

  const onMove = (event: PointerEvent<HTMLTableCellElement>, title: string, tooltipRows: TooltipRow[]): void => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ title, rows: tooltipRows, x: event.clientX - box.left, y: event.clientY - box.top });
  };

  return (
    <div ref={ref} className="relative">
      <div className="overflow-x-auto">
        <table className="w-full border-separate text-sm tabular-nums" style={{ borderSpacing: 2 }} aria-label={ariaLabel}>
          <thead>
            <tr>
              <th />
              {groups.map((group) => (
                <th
                  key={group.key}
                  colSpan={group.columns.length}
                  scope="colgroup"
                  className="px-2 pb-1 text-center text-xs font-semibold text-foreground"
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              <th />
              {groups.flatMap((group) =>
                group.columns.map((column) => (
                  <th
                    key={`${group.key}:${column.key}`}
                    scope="col"
                    className="px-2 pb-1 text-center text-xs font-medium text-muted-foreground"
                  >
                    {column.label}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="whitespace-nowrap pr-3 text-right text-xs font-medium text-muted-foreground">
                  {row.label}
                </th>
                {groups.flatMap((group) =>
                  group.columns.map((column) => {
                    const value = cell(row, group, column);
                    const title = `${row.label} · ${column.label} · ${group.label}`;
                    return value === null ? (
                      <td
                        key={`${group.key}:${column.key}`}
                        className="rounded-md bg-muted px-2 py-1.5 text-center text-xs text-muted-foreground"
                        aria-label={`${title}: not measured`}
                      >
                        —
                      </td>
                    ) : (
                      <td
                        key={`${group.key}:${column.key}`}
                        className="rounded-md px-2 py-1.5 text-center text-xs font-medium transition hover:ring-2 hover:ring-foreground/30"
                        style={{ background: value.fill, color: value.ink }}
                        aria-label={`${title}: ${value.text}`}
                        onPointerMove={(event) => onMove(event, title, value.rows)}
                        onPointerLeave={() => setHover(null)}
                      >
                        {value.text}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {legend && <div className="mt-3">{legend}</div>}
      {hover && <Tooltip x={hover.x} y={hover.y} width={width} title={hover.title} rows={hover.rows} />}
    </div>
  );
}
