import { useMemo, useState } from 'react';
import { formatBytes, formatDuration } from '@homeostate/benchmark/report';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ChoiceGroup, Controls, SelectField } from '../components/Controls';
import { DotPlot, type DotRow } from '../components/DotPlot';
import { Legend } from '../components/Legend';
import { Note } from '../components/Note';
import { SeriesLabel } from '../components/SeriesLabel';
import { formatRatio, formatTiming, metricByKey, operationMetrics } from '../lib/metrics';
import { colorFor } from '../lib/palette';
import { backendsOf, operationAt, scenariosOf, sizesOf } from '../lib/runs';
import type { ScaleKind } from '../lib/scale';
import { SCALE_OPTIONS, effectiveScale, finite, metricOptions, type ViewProps } from './shared';

const COLUMNS = ['scenario', 'backend', 'write', 'p50', 'p99', 'vs best', 'roundtrip', 'wire / op', 'doc Δ / op', 'heap Δ / op'];

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
        <ChoiceGroup
          label="State size"
          options={sizes.map((s) => ({ value: s, label: `${s.toLocaleString('en-US')} todos` }))}
          value={size}
          onChange={setSizeChoice}
        />
        <SelectField label="Metric" options={metricOptions(operationMetrics)} value={metric.key} onChange={setMetricKey} />
        <ChoiceGroup label="Axis scale" options={SCALE_OPTIONS} value={scaleChoice} onChange={setScaleChoice} />
      </Controls>

      <Card>
        <CardHeader>
          <CardTitle>{`${metric.label} per scenario`}</CardTitle>
          <CardDescription>{metric.description}</CardDescription>
          <CardAction>
            <Legend items={backends.map((b) => ({ label: b, color: colorFor(slots, b) }))} />
          </CardAction>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{`All figures at ${size.toLocaleString('en-US')} todos`}</CardTitle>
          <CardDescription>The fastest write per scenario is marked; “vs best” is the write mean relative to it.</CardDescription>
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
              {scenarios.map((scenario) => {
                const group = backends
                  .map((backend) => operationAt(report, size, scenario, backend))
                  .filter((o): o is NonNullable<typeof o> => o !== undefined);
                const best = Math.min(...group.map((o) => o.write.mean));
                return group.map((operation, index) => {
                  const isBest = operation.write.mean === best;
                  return (
                    <TableRow key={`${scenario}:${operation.backend}`}>
                      <TableCell className="font-medium">{index === 0 ? scenario : ''}</TableCell>
                      <TableCell>
                        <SeriesLabel color={colorFor(slots, operation.backend)}>
                          {operation.backend}
                          {isBest && <Badge variant="secondary">best</Badge>}
                        </SeriesLabel>
                      </TableCell>
                      <TableCell className={cn(isBest && 'font-semibold')} title={`${operation.write.samples.toLocaleString('en-US')} samples`}>
                        {formatTiming(operation.write)}
                      </TableCell>
                      <TableCell>{formatDuration(operation.write.p50)}</TableCell>
                      <TableCell>{formatDuration(operation.write.p99)}</TableCell>
                      <TableCell>{formatRatio(operation.write.mean, best)}</TableCell>
                      <TableCell title={`${operation.roundtrip.samples.toLocaleString('en-US')} samples`}>
                        {formatTiming(operation.roundtrip)}
                      </TableCell>
                      <TableCell>{formatBytes(operation.wireBytesPerOp)}</TableCell>
                      <TableCell>{formatBytes(operation.docBytesPerOp, true)}</TableCell>
                      <TableCell>{formatBytes(operation.heapBytesPerOp, true)}</TableCell>
                    </TableRow>
                  );
                });
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
