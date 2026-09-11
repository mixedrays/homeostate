import { useState } from 'react';
import { formatBytes } from '@homeostate/benchmark/report';
import { DotPlot, type DotRow } from '../components/DotPlot';
import { Legend } from '../components/Legend';
import { Card, Controls, Field, Note, Segmented, Select } from '../components/ui';
import { cx, tableClass, tdClass, thClass } from '../components/classes';
import { formatTiming, metricByKey, replicaMetrics } from '../lib/metrics';
import { colorFor } from '../lib/palette';
import { backendsOf, replicaAt, sizesOf } from '../lib/runs';
import type { ScaleKind } from '../lib/scale';
import { SCALE_OPTIONS, effectiveScale, finite, type ViewProps } from './shared';

export function ReplicasView({ report, slots }: ViewProps) {
  const sizes = sizesOf(report).filter((size) => report.replicas.some((r) => r.size === size));
  const backends = backendsOf(report);
  const [metricKey, setMetricKey] = useState('seed');
  const [scaleChoice, setScaleChoice] = useState<ScaleKind>('log');
  const metric = metricByKey(replicaMetrics, metricKey);

  const rows: DotRow[] = sizes.map((size) => ({
    key: String(size),
    label: `${size.toLocaleString('en-US')} todos`,
    points: backends.map((backend) => {
      const replica = replicaAt(report, size, backend);
      const spread = replica && metric.spread ? metric.spread(replica) : null;
      return {
        series: backend,
        color: colorFor(slots, backend),
        value: replica ? metric.value(replica) : null,
        low: spread?.[0],
        high: spread?.[1],
      };
    }),
  }));

  const values = finite(rows.flatMap((row) => row.points.map((p) => p.value)));
  const scale = effectiveScale(scaleChoice, values);

  return (
    <div className="space-y-6">
      <Controls>
        <Field label="Metric">
          <Select value={metric.key} onChange={(event) => setMetricKey(event.target.value)}>
            {replicaMetrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Segmented label="Axis scale" options={SCALE_OPTIONS} value={scaleChoice} onChange={setScaleChoice} />
      </Controls>

      <Card title={`${metric.label} per state size`} subtitle={metric.description} actions={<Legend items={backends.map((b) => ({ label: b, color: colorFor(slots, b) }))} />}>
        {rows.length === 0 ? (
          <Note>This run has no replica results.</Note>
        ) : (
          <>
            <DotPlot rows={rows} unit={metric.unit} kind={scale.kind} ariaLabel={`${metric.label} per state size, one dot per backend`} />
            <div className="mt-3 space-y-1">
              {metric.spread && <Note>Whiskers span the mean ± its relative margin of error.</Note>}
              {scale.forced && <Note>Shown on a linear axis because the values include zero or negatives.</Note>}
            </div>
          </>
        )}
      </Card>

      <Card
        title="Lifecycle of one replica"
        subtitle="seed: connect() of a store holding N todos against an empty backend · adopt: connect() of an empty store against a replica that already holds them"
      >
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                {['size', 'backend', 'seed', 'adopt', 'doc size', 'heap / replica'].map((h) => (
                  <th key={h} scope="col" className={thClass}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.map((size) =>
                backends
                  .map((backend) => replicaAt(report, size, backend))
                  .filter((r): r is NonNullable<typeof r> => r !== undefined)
                  .map((replica, index) => (
                    <tr key={`${size}:${replica.backend}`} className="hover:bg-slate-50">
                      <td className={cx(tdClass, 'font-medium text-slate-900')}>{index === 0 ? `${size.toLocaleString('en-US')} todos` : ''}</td>
                      <td className={tdClass}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(slots, replica.backend) }} aria-hidden />
                          {replica.backend}
                        </span>
                      </td>
                      <td className={tdClass} title={`${replica.seed.samples.toLocaleString('en-US')} samples`}>
                        {formatTiming(replica.seed)}
                      </td>
                      <td className={tdClass} title={`${replica.adopt.samples.toLocaleString('en-US')} samples`}>
                        {formatTiming(replica.adopt)}
                      </td>
                      <td className={tdClass}>{formatBytes(replica.docBytes)}</td>
                      <td className={tdClass}>{formatBytes(replica.heapBytes)}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
