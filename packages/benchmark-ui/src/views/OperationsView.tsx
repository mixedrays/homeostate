import { useMemo, useState } from 'react';
import { formatBytes, formatDuration } from '@homeostate/benchmark/report';
import { DotPlot, type DotRow } from '../components/DotPlot';
import { Legend } from '../components/Legend';
import { Card, Controls, Field, Note, Segmented, Select } from '../components/ui';
import { cx, tableClass, tdClass, thClass } from '../components/classes';
import { formatRatio, formatTiming, metricByKey, operationMetrics } from '../lib/metrics';
import { colorFor } from '../lib/palette';
import { backendsOf, operationAt, scenariosOf, sizesOf } from '../lib/runs';
import type { ScaleKind } from '../lib/scale';
import { SCALE_OPTIONS, effectiveScale, finite, type ViewProps } from './shared';

export function OperationsView({ report, slots }: ViewProps) {
  const sizes = sizesOf(report);
  const backends = backendsOf(report);
  const [sizeChoice, setSizeChoice] = useState<number | null>(null);
  const [metricKey, setMetricKey] = useState('write');
  const [scaleChoice, setScaleChoice] = useState<ScaleKind>('log');

  const size = sizeChoice !== null && sizes.includes(sizeChoice) ? sizeChoice : sizes[sizes.length - 1];
  const metric = metricByKey(operationMetrics, metricKey);
  const scenarios = scenariosOf(report).filter((scenario) =>
    backends.some((backend) => operationAt(report, size, scenario, backend))
  );

  const rows: DotRow[] = useMemo(
    () =>
      scenarios.map((scenario) => ({
        key: scenario,
        label: scenario,
        points: backends.map((backend) => {
          const operation = operationAt(report, size, scenario, backend);
          const spread = operation && metric.spread ? metric.spread(operation) : null;
          return {
            series: backend,
            color: colorFor(slots, backend),
            value: operation ? metric.value(operation) : null,
            low: spread?.[0],
            high: spread?.[1],
          };
        }),
      })),
    [scenarios, backends, report, size, metric, slots]
  );

  const values = finite(rows.flatMap((row) => row.points.map((p) => p.value)));
  const scale = effectiveScale(scaleChoice, values);

  return (
    <div className="space-y-6">
      <Controls>
        <Segmented
          label="State size"
          options={sizes.map((s) => ({ value: s, label: `${s.toLocaleString('en-US')} todos` }))}
          value={size}
          onChange={setSizeChoice}
        />
        <Field label="Metric">
          <Select value={metric.key} onChange={(event) => setMetricKey(event.target.value)}>
            {operationMetrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Segmented label="Axis scale" options={SCALE_OPTIONS} value={scaleChoice} onChange={setScaleChoice} />
      </Controls>

      <Card title={`${metric.label} per scenario`} subtitle={metric.description} actions={<Legend items={backends.map((b) => ({ label: b, color: colorFor(slots, b) }))} />}>
        {rows.length === 0 ? (
          <Note>No scenario was measured at this size.</Note>
        ) : (
          <>
            <DotPlot
              rows={rows}
              unit={metric.unit}
              signed={metric.signed}
              kind={scale.kind}
              ariaLabel={`${metric.label} per scenario at ${size} todos, one dot per backend`}
            />
            <div className="mt-3 space-y-1">
              {metric.spread && <Note>Whiskers span the mean ± its relative margin of error.</Note>}
              {scale.forced && <Note>Shown on a linear axis because the values include zero or negatives.</Note>}
            </div>
          </>
        )}
      </Card>

      <Card title={`All figures at ${size.toLocaleString('en-US')} todos`} subtitle="The fastest write per scenario is marked; “vs best” is the write mean relative to it.">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                {['scenario', 'backend', 'write', 'p50', 'p99', 'vs best', 'roundtrip', 'wire / op', 'doc Δ / op', 'heap Δ / op'].map((h) => (
                  <th key={h} scope="col" className={thClass}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => {
                const group = backends
                  .map((backend) => operationAt(report, size, scenario, backend))
                  .filter((o): o is NonNullable<typeof o> => o !== undefined);
                const best = Math.min(...group.map((o) => o.write.mean));
                return group.map((operation, index) => {
                  const isBest = operation.write.mean === best;
                  return (
                    <tr key={`${scenario}:${operation.backend}`} className="hover:bg-slate-50">
                      <td className={cx(tdClass, 'font-medium text-slate-900')}>{index === 0 ? scenario : ''}</td>
                      <td className={tdClass}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(slots, operation.backend) }} aria-hidden />
                          {operation.backend}
                          {isBest && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                              best
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={cx(tdClass, isBest && 'font-semibold text-slate-900')} title={`${operation.write.samples.toLocaleString('en-US')} samples`}>
                        {formatTiming(operation.write)}
                      </td>
                      <td className={tdClass}>{formatDuration(operation.write.p50)}</td>
                      <td className={tdClass}>{formatDuration(operation.write.p99)}</td>
                      <td className={tdClass}>{formatRatio(operation.write.mean, best)}</td>
                      <td className={tdClass} title={`${operation.roundtrip.samples.toLocaleString('en-US')} samples`}>
                        {formatTiming(operation.roundtrip)}
                      </td>
                      <td className={tdClass}>{formatBytes(operation.wireBytesPerOp)}</td>
                      <td className={tdClass}>{formatBytes(operation.docBytesPerOp, true)}</td>
                      <td className={tdClass}>{formatBytes(operation.heapBytesPerOp, true)}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
