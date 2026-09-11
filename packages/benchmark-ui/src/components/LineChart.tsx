import { useState, type PointerEvent } from 'react';
import { useMeasure } from '../hooks/useMeasure';
import { formatTick, formatValue, type Unit } from '../lib/metrics';
import { INK } from '../lib/palette';
import { makeScale, scaleFor, type ScaleKind } from '../lib/scale';
import { Tooltip } from './Tooltip';

export interface LinePoint {
  x: number;
  y: number | null;
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  points: LinePoint[];
}

interface LineChartProps {
  series: LineSeries[];
  /** Every x position, ascending; ticks and the crosshair snap to these. */
  xs: number[];
  xLabel: string;
  unit: Unit;
  signed?: boolean;
  kind: ScaleKind;
  ariaLabel: string;
  /** Fixed width in pixels; measured from the container when omitted. */
  width?: number;
}

const HEIGHT = 260;
const TOP = 12;
const AXIS = 34;
const LEFT_PAD = 12;
const RIGHT_PAD = 24;
const LABEL_GAP = 14;

/** Multi-series lines over discrete x positions, with a crosshair readout listing every series. */
export function LineChart({ series, xs, xLabel, unit, signed = false, kind, ariaLabel, width: fixedWidth }: LineChartProps) {
  const [ref, measured] = useMeasure<HTMLDivElement>();
  const width = fixedWidth ?? measured;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const values = series.flatMap((s) => s.points.flatMap((p) => (p.y === null ? [] : [p.y])));
  const longestTick = Math.max(3, ...values.map((v) => formatTick(unit, v).length));
  const leftAxis = LEFT_PAD + 7 * longestTick + 8;
  const plotRight = Math.max(leftAxis, width - RIGHT_PAD);
  const plotBottom = TOP + HEIGHT;

  const y = scaleFor(kind, values, [plotBottom, TOP], unit === 'bytes' ? 'bytes' : 'decimal');
  const positiveXs = xs.filter((v) => v > 0);
  const xKind: ScaleKind = positiveXs.length === xs.length && xs.length > 1 ? 'log' : 'linear';
  const xDomain: [number, number] = xs.length > 1 ? [xs[0], xs[xs.length - 1]] : [xs[0] ?? 0, (xs[0] ?? 0) + 1];
  const x = makeScale(xKind, xDomain, xs, [leftAxis, plotRight]);
  const visible = (v: number | null): v is number => v !== null && (y.kind !== 'log' || v > 0);

  const endLabels = series
    .map((s) => {
      const last = [...s.points].reverse().find((p) => visible(p.y));
      return last ? { key: s.key, label: s.label, y: y(last.y as number), x: x(last.x) } : null;
    })
    .filter((l): l is { key: string; label: string; y: number; x: number } => l !== null)
    .sort((a, b) => a.y - b.y);
  const labelsCollide = endLabels.some((label, i) => i > 0 && label.y - endLabels[i - 1].y < LABEL_GAP);

  const onMove = (event: PointerEvent<SVGRectElement>): void => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || xs.length === 0) return;
    const px = event.clientX - box.left;
    let nearest = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(x(xs[i]) - px) < Math.abs(x(xs[nearest]) - px)) nearest = i;
    setHoverIndex(nearest);
  };

  const hoverX = hoverIndex === null ? null : xs[hoverIndex];

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={plotBottom + AXIS} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {y.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={leftAxis}
                x2={plotRight}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? INK.axis : INK.grid}
                shapeRendering="crispEdges"
              />
              <text
                x={leftAxis - 8}
                y={y(tick)}
                dy="0.35em"
                textAnchor="end"
                fontSize={11}
                fill={INK.muted}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatTick(unit, tick)}
              </text>
            </g>
          ))}
          <line x1={leftAxis} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke={INK.axis} shapeRendering="crispEdges" />
          {xs.map((tick) => (
            <text
              key={tick}
              x={x(tick)}
              y={plotBottom + 18}
              textAnchor="middle"
              fontSize={11}
              fill={INK.muted}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {tick.toLocaleString('en-US')}
            </text>
          ))}
          <text x={(leftAxis + plotRight) / 2} y={plotBottom + AXIS - 2} textAnchor="middle" fontSize={11} fill={INK.secondary}>
            {xLabel}
          </text>

          {hoverX !== null && (
            <line x1={x(hoverX)} x2={x(hoverX)} y1={TOP} y2={plotBottom} stroke={INK.axis} shapeRendering="crispEdges" />
          )}

          {series.map((s) => {
            const shown = s.points.filter((p): p is { x: number; y: number } => visible(p.y));
            const path = shown.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.x)},${y(p.y)}`).join(' ');
            return (
              <g key={s.key}>
                {shown.length > 1 && (
                  <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                )}
                {shown.map((p) => (
                  <circle
                    key={p.x}
                    cx={x(p.x)}
                    cy={y(p.y)}
                    r={hoverX === p.x ? 5 : 4}
                    fill={s.color}
                    stroke={INK.surface}
                    strokeWidth={2}
                  />
                ))}
              </g>
            );
          })}

          {!labelsCollide &&
            endLabels.map((label) => (
              <text key={label.key} x={label.x + 9} y={label.y} dy="0.35em" fontSize={11} fill={INK.secondary}>
                {label.label}
              </text>
            ))}

          <rect
            x={leftAxis}
            y={TOP}
            width={Math.max(0, plotRight - leftAxis)}
            height={HEIGHT}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </svg>
      )}

      {hoverX !== null && (
        <Tooltip
          x={x(hoverX)}
          y={TOP + 8}
          width={width}
          title={`${hoverX.toLocaleString('en-US')} ${xLabel}`}
          rows={series.map((s) => {
            const point = s.points.find((p) => p.x === hoverX);
            const value = point?.y ?? null;
            return { label: s.label, color: s.color, value: formatValue(unit, value, signed), muted: value === null };
          })}
        />
      )}
    </div>
  );
}
