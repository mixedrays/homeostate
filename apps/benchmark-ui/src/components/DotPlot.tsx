import { useState, type FocusEvent, type PointerEvent } from 'react';
import { useMeasure } from '../hooks/useMeasure';
import { formatTick, formatValue, type Unit } from '../lib/metrics';
import { INK } from '../lib/palette';
import { scaleFor, type ScaleKind } from '../lib/scale';
import { Tooltip } from './Tooltip';

export interface DotPoint {
  series: string;
  color: string;
  value: number | null;
  low?: number;
  high?: number;
}

export interface DotRow {
  key: string;
  label: string;
  points: DotPoint[];
}

interface DotPlotProps {
  rows: DotRow[];
  unit: Unit;
  signed?: boolean;
  kind: ScaleKind;
  ariaLabel: string;
  /** Fixed width in pixels; measured from the container when omitted. */
  width?: number;
}

const ROW = 30;
const TOP = 8;
const AXIS = 30;
const RIGHT = 24;
const GAP = 12;

interface Hover {
  row: number;
  x: number;
  y: number;
}

/** Categories as rows, one dot per series, whiskers for the margin of error. */
export function DotPlot({ rows, unit, signed = false, kind, ariaLabel, width: fixedWidth }: DotPlotProps) {
  const [ref, measured] = useMeasure<HTMLDivElement>();
  const width = fixedWidth ?? measured;
  const [hover, setHover] = useState<Hover | null>(null);

  const longest = Math.max(4, ...rows.map((row) => row.label.length));
  const labelWidth = Math.min(160, 8 + 7 * longest);
  const left = labelWidth + GAP;
  const plotWidth = Math.max(0, width - left - RIGHT);
  const plotHeight = rows.length * ROW;
  const height = TOP + plotHeight + AXIS;

  const values = rows.flatMap((row) =>
    row.points.flatMap((p) => (p.value === null ? [] : [p.value, p.low ?? p.value, p.high ?? p.value]))
  );
  const scale = scaleFor(kind, values, [left, left + plotWidth], unit === 'bytes' ? 'bytes' : 'decimal');
  const visible = (v: number): boolean => scale.kind !== 'log' || v > 0;

  const locate = (event: PointerEvent | FocusEvent, row: number, fallbackY: number): Hover => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !('clientX' in event)) return { row, x: left + plotWidth / 2, y: fallbackY };
    return { row, x: event.clientX - box.left, y: event.clientY - box.top };
  };

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={scale(tick)}
                x2={scale(tick)}
                y1={TOP}
                y2={TOP + plotHeight}
                stroke={tick === 0 ? INK.axis : INK.grid}
                shapeRendering="crispEdges"
              />
              <text
                x={scale(tick)}
                y={TOP + plotHeight + 18}
                textAnchor="middle"
                fontSize={11}
                fill={INK.muted}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatTick(unit, tick)}
              </text>
            </g>
          ))}

          {rows.map((row, index) => {
            const top = TOP + index * ROW;
            const cy = top + ROW / 2;
            const active = hover?.row === index;
            return (
              <g key={row.key}>
                {active && <rect x={0} y={top} width={width} height={ROW} fill="rgba(11,11,11,0.04)" />}
                <text
                  x={labelWidth}
                  y={cy}
                  dy="0.35em"
                  textAnchor="end"
                  fontSize={12}
                  fill={active ? INK.primary : INK.secondary}
                >
                  {row.label}
                </text>
                {row.points.map((point) => {
                  if (point.value === null || !visible(point.value)) return null;
                  const whisker =
                    point.low !== undefined &&
                    point.high !== undefined &&
                    point.high > point.low &&
                    visible(point.low);
                  return (
                    <g key={point.series}>
                      {whisker && (
                        <line
                          x1={scale(point.low as number)}
                          x2={scale(point.high as number)}
                          y1={cy}
                          y2={cy}
                          stroke={point.color}
                          strokeWidth={2}
                          strokeLinecap="round"
                          opacity={0.55}
                        />
                      )}
                      <circle
                        cx={scale(point.value)}
                        cy={cy}
                        r={active ? 6 : 5}
                        fill={point.color}
                        stroke={INK.surface}
                        strokeWidth={2}
                      />
                    </g>
                  );
                })}
                <rect
                  x={0}
                  y={top}
                  width={width}
                  height={ROW}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${row.label}: ${row.points
                    .map((p) => `${p.series} ${formatValue(unit, p.value, signed)}`)
                    .join(', ')}`}
                  className="outline-hidden"
                  onPointerMove={(event) => setHover(locate(event, index, cy))}
                  onPointerLeave={() => setHover(null)}
                  onFocus={(event) => setHover(locate(event, index, cy))}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}

      {hover && rows[hover.row] && (
        <Tooltip
          x={hover.x}
          y={hover.y}
          width={width}
          title={rows[hover.row].label}
          rows={rows[hover.row].points.map((point) => ({
            label: point.series,
            color: point.color,
            value: formatValue(unit, point.value, signed),
            muted: point.value === null,
          }))}
        />
      )}
    </div>
  );
}
