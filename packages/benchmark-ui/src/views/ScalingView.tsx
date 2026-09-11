import { useState } from 'react';
import { Legend } from '../components/Legend';
import { LineChart, type LineSeries } from '../components/LineChart';
import { Card, Controls, Field, Note, Segmented, Select } from '../components/ui';
import { cx, tableClass, tdClass, thClass } from '../components/classes';
import { formatValue, metricByKey, operationMetrics } from '../lib/metrics';
import { colorFor } from '../lib/palette';
import { backendsOf, operationAt, scenariosOf, sizesOf } from '../lib/runs';
import { logLogSlope, type ScaleKind } from '../lib/scale';
import { SCALE_OPTIONS, effectiveScale, finite, type ViewProps } from './shared';

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
        <Field label="Scenario">
          <Select value={scenario ?? ''} onChange={(event) => setScenarioChoice(event.target.value)}>
            {scenarios.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
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

      <Card
        title={`${metric.label} against state size`}
        subtitle={scenario ? `${scenario}: ${metric.description}` : metric.description}
        actions={<Legend items={backends.map((b) => ({ label: b, color: colorFor(slots, b) }))} mark="line" />}
      >
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
      </Card>

      <Card
        title="Growth per backend"
        subtitle="The exponent k is the least-squares slope of log(value) against log(todos): 0 is flat, 1 linear, 2 quadratic. Indicative only with a few sizes."
      >
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>
                  backend
                </th>
                {measuredSizes.map((size) => (
                  <th key={size} scope="col" className={thClass}>
                    {size.toLocaleString('en-US')} todos
                  </th>
                ))}
                <th scope="col" className={thClass}>
                  exponent k
                </th>
                <th scope="col" className={thClass}>
                  per ×10 todos
                </th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => {
                const k = logLogSlope(s.points.filter((p): p is { x: number; y: number } => p.y !== null).map((p) => ({ x: p.x, y: p.y })));
                return (
                  <tr key={s.key} className="hover:bg-slate-50">
                    <td className={cx(tdClass, 'font-medium text-slate-900')}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                        {s.label}
                      </span>
                    </td>
                    {s.points.map((p) => (
                      <td key={p.x} className={tdClass}>
                        {formatValue(metric.unit, p.y, metric.signed)}
                      </td>
                    ))}
                    <td className={tdClass}>{k === null ? '—' : `${k.toFixed(2)} (${describeExponent(k)})`}</td>
                    <td className={tdClass}>{k === null ? '—' : `×${(10 ** k).toFixed(10 ** k < 10 ? 1 : 0)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
