import { useState } from 'react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChoiceGroup, Controls, SelectField } from '../components/Controls';
import { Legend } from '../components/Legend';
import { LineChart, type LineSeries } from '../components/LineChart';
import { Note } from '../components/Note';
import { SeriesLabel } from '../components/SeriesLabel';
import { formatValue, metricByKey, operationMetrics } from '../lib/metrics';
import { colorFor } from '../lib/palette';
import { backendsOf, operationAt, scenariosOf, sizesOf } from '../lib/runs';
import { logLogSlope, type ScaleKind } from '../lib/scale';
import { SCALE_OPTIONS, effectiveScale, finite, metricOptions, type ViewProps } from './shared';

const describeExponent = (k: number): string => {
  if (k < 0.25) return 'flat';
  if (k < 0.75) return 'sublinear';
  if (k < 1.25) return '≈ linear';
  if (k < 1.75) return 'superlinear';
  return '≈ quadratic or worse';
};

export function ScalingView({ report, slots }: ViewProps) {
  const sizes = sizesOf(report);
  const backends = backendsOf(report);
  const scenarios = scenariosOf(report);
  const [scenarioChoice, setScenarioChoice] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState('write');
  const [scaleChoice, setScaleChoice] = useState<ScaleKind>('log');

  const scenario = scenarioChoice !== null && scenarios.includes(scenarioChoice) ? scenarioChoice : scenarios[0];
  const metric = metricByKey(operationMetrics, metricKey);
  const measuredSizes = sizes.filter((size) => backends.some((backend) => operationAt(report, size, scenario, backend)));

  const series: LineSeries[] = backends.map((backend) => ({
    key: backend,
    label: backend,
    color: colorFor(slots, backend),
    points: measuredSizes.map((size) => {
      const operation = operationAt(report, size, scenario, backend);
      return { x: size, y: operation ? metric.value(operation) : null };
    }),
  }));

  const values = finite(series.flatMap((s) => s.points.map((p) => p.y)));
  const scale = effectiveScale(scaleChoice, values);

  return (
    <div className="space-y-6">
      <Controls>
        <SelectField
          label="Scenario"
          options={scenarios.map((s) => ({ value: s, label: s }))}
          value={scenario ?? null}
          onChange={setScenarioChoice}
        />
        <SelectField label="Metric" options={metricOptions(operationMetrics)} value={metric.key} onChange={setMetricKey} />
        <ChoiceGroup label="Axis scale" options={SCALE_OPTIONS} value={scaleChoice} onChange={setScaleChoice} />
      </Controls>

      <Card>
        <CardHeader>
          <CardTitle>{`${metric.label} against state size`}</CardTitle>
          <CardDescription>{scenario ? `${scenario}: ${metric.description}` : metric.description}</CardDescription>
          <CardAction>
            <Legend items={backends.map((b) => ({ label: b, color: colorFor(slots, b) }))} mark="line" />
          </CardAction>
        </CardHeader>
        <CardContent>
          {measuredSizes.length === 0 ? (
            <Note>This scenario has no measurements in the run.</Note>
          ) : (
            <>
              <LineChart
                series={series}
                xs={measuredSizes}
                xLabel="todos"
                unit={metric.unit}
                signed={metric.signed}
                kind={scale.kind}
                ariaLabel={`${metric.label} for ${scenario} against state size, one line per backend`}
              />
              <div className="mt-3 space-y-1">
                {measuredSizes.length < 2 && <Note>Only one size was measured for this scenario, so there is no trend to draw.</Note>}
                {scale.forced && <Note>Shown on a linear axis because the values include zero or negatives.</Note>}
                {measuredSizes.length > 1 && (
                  <Note>Both axes are logarithmic when possible, so a straight line means a power law and its slope is the exponent below.</Note>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Growth per backend</CardTitle>
          <CardDescription>
            The exponent k is the least-squares slope of log(value) against log(todos): 0 is flat, 1 linear, 2 quadratic. Indicative only with a few sizes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">backend</TableHead>
                {measuredSizes.map((size) => (
                  <TableHead key={size} scope="col">
                    {size.toLocaleString('en-US')} todos
                  </TableHead>
                ))}
                <TableHead scope="col">exponent k</TableHead>
                <TableHead scope="col">per ×10 todos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((s) => {
                const k = logLogSlope(s.points.filter((p): p is { x: number; y: number } => p.y !== null).map((p) => ({ x: p.x, y: p.y })));
                return (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium">
                      <SeriesLabel color={s.color}>{s.label}</SeriesLabel>
                    </TableCell>
                    {s.points.map((p) => (
                      <TableCell key={p.x}>{formatValue(metric.unit, p.y, metric.signed)}</TableCell>
                    ))}
                    <TableCell>{k === null ? '—' : `${k.toFixed(2)} (${describeExponent(k)})`}</TableCell>
                    <TableCell>{k === null ? '—' : `×${(10 ** k).toFixed(10 ** k < 10 ? 1 : 0)}`}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
