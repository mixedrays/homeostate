import { useState } from 'react';
import { formatBytes } from '@homeostate/benchmark/report';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChoiceGroup, Controls, SelectField } from '../components/Controls';
import { DotPlot, type DotRow } from '../components/DotPlot';
import { Legend } from '../components/Legend';
import { Note } from '../components/Note';
import { SeriesLabel } from '../components/SeriesLabel';
import { formatTiming, metricByKey, replicaMetrics } from '../lib/metrics';
import { colorFor } from '../lib/palette';
import { backendsOf, replicaAt, sizesOf } from '../lib/runs';
import type { ScaleKind } from '../lib/scale';
import { SCALE_OPTIONS, effectiveScale, finite, metricOptions, type ViewProps } from './shared';

const COLUMNS = ['size', 'backend', 'seed', 'adopt', 'doc size', 'heap / replica'];

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
        <SelectField label="Metric" options={metricOptions(replicaMetrics)} value={metric.key} onChange={setMetricKey} />
        <ChoiceGroup label="Axis scale" options={SCALE_OPTIONS} value={scaleChoice} onChange={setScaleChoice} />
      </Controls>

      <Card>
        <CardHeader>
          <CardTitle>{`${metric.label} per state size`}</CardTitle>
          <CardDescription>{metric.description}</CardDescription>
          <CardAction>
            <Legend items={backends.map((b) => ({ label: b, color: colorFor(slots, b) }))} />
          </CardAction>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle of one replica</CardTitle>
          <CardDescription>
            seed: connect() of a store holding N todos against an empty backend · adopt: connect() of an empty store against a replica that already holds them
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow>
                {COLUMNS.map((column) => (
                  <TableHead key={column} scope="col">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sizes.map((size) =>
                backends
                  .map((backend) => replicaAt(report, size, backend))
                  .filter((r): r is NonNullable<typeof r> => r !== undefined)
                  .map((replica, index) => (
                    <TableRow key={`${size}:${replica.backend}`}>
                      <TableCell className="font-medium">{index === 0 ? `${size.toLocaleString('en-US')} todos` : ''}</TableCell>
                      <TableCell>
                        <SeriesLabel color={colorFor(slots, replica.backend)}>{replica.backend}</SeriesLabel>
                      </TableCell>
                      <TableCell title={`${replica.seed.samples.toLocaleString('en-US')} samples`}>{formatTiming(replica.seed)}</TableCell>
                      <TableCell title={`${replica.adopt.samples.toLocaleString('en-US')} samples`}>{formatTiming(replica.adopt)}</TableCell>
                      <TableCell>{formatBytes(replica.docBytes)}</TableCell>
                      <TableCell>{formatBytes(replica.heapBytes)}</TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
