import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ChoiceGroup,
  Controls,
  SelectField,
  ThresholdField,
} from "../components/Controls";
import { DeltaBadge } from "../components/DeltaBadge";
import { Legend } from "../components/Legend";
import { LineChart, type LineSeries } from "../components/LineChart";
import { Note } from "../components/Note";
import { SeriesLabel } from "../components/SeriesLabel";
import {
  formatValue,
  metricByKey,
  operationMetrics,
  replicaMetrics,
} from "../lib/metrics";
import { colorFor } from "../lib/palette";
import {
  formatDate,
  operationAt,
  replicaAt,
  shortCommit,
  type Run,
} from "../lib/runs";
import type { ScaleKind } from "../lib/scale";
import {
  backendsAcross,
  chronological,
  deltaAt,
  describeChange,
  read,
  rebase,
  scenariosAcross,
  sizesAcross,
  stepsOf,
  tickLabel,
  writtenAt,
  type Change,
  type Reading,
} from "../lib/trend";
import { SCALE_OPTIONS, effectiveScale, finite, metricOptions } from "./shared";

interface TrendViewProps {
  runs: Run[];
  /** Runs left out of the trend; a newly loaded run is in it. */
  excluded: ReadonlySet<string>;
  onExcludedChange(excluded: Set<string>): void;
  /** Opens two runs in the Compare tab. */
  onCompare(baselineId: string, currentId: string): void;
  slots: Map<string, number>;
}

/** The scenario choice for the per-replica metrics, which belong to no scenario. */
const REPLICAS = "(replicas)";

type Mode = "change" | "value";

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: "change", label: "change from first" },
  { value: "value", label: "values" },
];

const describeRun = (run: Run): string =>
  `${shortCommit(run.report.meta)} · ${formatDate(writtenAt(run.report.meta))} — ${run.name}`;

const provenance = (run: Run): string => {
  const { meta } = run.report;
  return meta.commitDate
    ? `committed ${formatDate(meta.commitDate)}, benchmarked ${formatDate(meta.date)}`
    : `benchmarked ${formatDate(meta.date)}; the report has no commit date`;
};

function RunToggle({
  run,
  checked,
  onChange,
}: {
  run: Run;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal" className="w-auto" title={provenance(run)}>
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <FieldLabel
        htmlFor={id}
        className="min-w-0 font-normal text-muted-foreground"
      >
        <span className="font-medium text-foreground tabular-nums">
          {shortCommit(run.report.meta)}
        </span>
        <span className="truncate">
          {formatDate(writtenAt(run.report.meta))} — {run.name}
        </span>
      </FieldLabel>
    </Field>
  );
}

function ChangeCell({ change }: { change: Change | undefined }) {
  if (!change)
    return <TableCell className="text-muted-foreground">—</TableCell>;
  return (
    <TableCell>
      <span className="inline-flex items-center gap-2">
        <DeltaBadge delta={change.delta} />
        <span className="text-muted-foreground">{describeChange(change)}</span>
      </span>
    </TableCell>
  );
}

export function TrendView({
  runs,
  excluded,
  onExcludedChange,
  onCompare,
  slots,
}: TrendViewProps) {
  const [scenarioChoice, setScenarioChoice] = useState<string | null>(null);
  const [sizeChoice, setSizeChoice] = useState<number | null>(null);
  const [metricKey, setMetricKey] = useState("write");
  const [mode, setMode] = useState<Mode>("change");
  const [scaleChoice, setScaleChoice] = useState<ScaleKind>("log");
  const [thresholdPct, setThresholdPct] = useState(5);

  const ordered = useMemo(() => chronological(runs), [runs]);
  const selected = useMemo(
    () => ordered.filter((run) => !excluded.has(run.id)),
    [ordered, excluded],
  );
  const steps = useMemo(
    () => stepsOf(selected, Math.max(0, thresholdPct) / 100),
    [selected, thresholdPct],
  );

  if (runs.length < 2)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Follow a metric across runs</CardTitle>
        </CardHeader>
        <CardContent>
          <Note>
            Load two or more reports to see how each metric moves across them.
            For a history of core, save one report per commit, named after it:{" "}
            <code className="rounded-sm bg-muted px-1 py-0.5 font-mono">
              pnpm bench:crdt -- --json results/$(git rev-parse --short
              HEAD).json
            </code>
            . Runs are ordered by the date of their commit, so a commit
            benchmarked later still lands in its place.
          </Note>
        </CardContent>
      </Card>
    );

  const toggle = (id: string, included: boolean): void => {
    const next = new Set(excluded);
    if (included) next.delete(id);
    else next.add(id);
    onExcludedChange(next);
  };

  const scenarios = scenariosAcross(selected);
  const sizes = sizesAcross(selected);
  const backends = backendsAcross(selected);
  const scenario =
    scenarioChoice === REPLICAS ||
    (scenarioChoice !== null && scenarios.includes(scenarioChoice))
      ? scenarioChoice
      : (scenarios[0] ?? REPLICAS);
  const replicas = scenario === REPLICAS;
  const size =
    sizeChoice !== null && sizes.includes(sizeChoice)
      ? sizeChoice
      : (sizes[sizes.length - 1] ?? 0);
  const metric = replicas
    ? metricByKey(replicaMetrics, metricKey)
    : metricByKey(operationMetrics, metricKey);
  const where = `${replicas ? "per replica" : scenario} · ${size.toLocaleString("en-US")} todos`;

  const reading = (run: Run, backend: string): Reading =>
    replicas
      ? read(
          metricByKey(replicaMetrics, metricKey),
          replicaAt(run.report, size, backend),
        )
      : read(
          metricByKey(operationMetrics, metricKey),
          operationAt(run.report, size, scenario, backend),
        );

  const lines = backends
    .map((backend) => ({
      backend,
      color: colorFor(slots, backend),
      readings: selected.map((run) => reading(run, backend)),
    }))
    .filter((line) => line.readings.some((r) => r.value !== null));
  const plotted = lines.map((line) => ({
    ...line,
    points: mode === "change" ? rebase(line.readings) : line.readings,
  }));
  const startsAtZero = plotted
    .filter((line) => line.points.every((p) => p.value === null))
    .map((line) => line.backend);

  const series: LineSeries[] = plotted.map((line) => ({
    key: line.backend,
    label: line.backend,
    color: line.color,
    points: line.points.map((p, index) => ({
      x: index,
      y: p.value,
      low: p.spread?.[0],
      high: p.spread?.[1],
    })),
  }));
  const values = finite(
    series.flatMap((s) =>
      s.points.flatMap((p) => [p.y, p.low ?? null, p.high ?? null]),
    ),
  );
  const scale =
    mode === "change"
      ? { kind: "linear" as const, forced: false }
      : effectiveScale(scaleChoice, values);

  /** Change of the charted metric from the run before, with the rule of the Compare tab. */
  const deltaFor = (index: number, backend: string) =>
    index === 0
      ? undefined
      : deltaAt(
          steps[index - 1].comparison,
          size,
          replicas ? null : scenario,
          backend,
          metric.label,
        );

  const unshared = steps.some((step) => step.comparison.rows.length === 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
          <CardDescription>
            {`${selected.length} of ${ordered.length} in the trend, oldest commit first. Uncheck a run to leave it out.`}
          </CardDescription>
          <CardAction className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onExcludedChange(new Set())}
              disabled={excluded.size === 0}
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onExcludedChange(new Set(ordered.map((run) => run.id)))
              }
              disabled={selected.length === 0}
            >
              None
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ul className="grid max-h-60 gap-x-6 gap-y-2 overflow-y-auto lg:grid-cols-2">
            {ordered.map((run) => (
              <li key={run.id} className="min-w-0">
                <RunToggle
                  run={run}
                  checked={!excluded.has(run.id)}
                  onChange={(checked) => toggle(run.id, checked)}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {selected.length < 2 ? (
        <Note>Select at least two runs to draw a trend.</Note>
      ) : (
        <>
          <Controls>
            <SelectField
              label="Scenario"
              options={[
                ...scenarios.map((s) => ({ value: s, label: s })),
                { value: REPLICAS, label: "per replica" },
              ]}
              value={scenario}
              onChange={setScenarioChoice}
            />
            <ChoiceGroup
              label="State size"
              options={sizes.map((s) => ({
                value: s,
                label: `${s.toLocaleString("en-US")} todos`,
              }))}
              value={size}
              onChange={setSizeChoice}
            />
            <SelectField
              label="Metric"
              options={metricOptions(
                replicas ? replicaMetrics : operationMetrics,
              )}
              value={metric.key}
              onChange={setMetricKey}
            />
            <ChoiceGroup
              label="Show"
              options={MODE_OPTIONS}
              value={mode}
              onChange={setMode}
            />
            {mode === "value" && (
              <ChoiceGroup
                label="Axis scale"
                options={SCALE_OPTIONS}
                value={scaleChoice}
                onChange={setScaleChoice}
              />
            )}
            <ThresholdField value={thresholdPct} onChange={setThresholdPct} />
          </Controls>

          <Card>
            <CardHeader>
              <CardTitle>
                {mode === "change"
                  ? `${metric.label}, change from the first run`
                  : `${metric.label} across runs`}
              </CardTitle>
              <CardDescription>{`${where}: ${metric.description}`}</CardDescription>
              <CardAction>
                <Legend
                  items={lines.map((line) => ({
                    label: line.backend,
                    color: line.color,
                  }))}
                  mark="line"
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              {series.length === 0 ? (
                <Note>None of the selected runs measured this.</Note>
              ) : (
                <>
                  <LineChart
                    series={series}
                    xs={selected.map((_, index) => index)}
                    xKind="linear"
                    formatX={(index) => tickLabel(selected[index])}
                    describeX={(index) => describeRun(selected[index])}
                    xLabel="run"
                    unit={mode === "change" ? "ratio" : metric.unit}
                    signed={mode === "change" || metric.signed}
                    kind={scale.kind}
                    ariaLabel={`${metric.label} for ${where} across ${selected.length} runs, one line per backend`}
                  />
                  <div className="mt-3 space-y-1">
                    <Note>
                      One point per run, in commit order, oldest first.
                      {mode === "change"
                        ? " Each line is relative to its own first value, so backends of any speed share the axis."
                        : ""}{" "}
                      Whiskers show the mean ± margin of error.
                    </Note>
                    {startsAtZero.length > 0 && (
                      <Note>
                        {`${startsAtZero.join(", ")} ${startsAtZero.length === 1 ? "starts" : "start"} at zero, so there is no relative change to draw; switch to values.`}
                      </Note>
                    )}
                    {scale.forced && (
                      <Note>
                        Shown on a linear axis because the values include zero
                        or negatives.
                      </Note>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Changes between consecutive runs</CardTitle>
              <CardDescription>
                Every metric, scenario, backend, and size, with the rule of the
                Compare tab: beyond the threshold and, for timings, beyond both
                margins of error. Open a step in Compare for every figure.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Table className="tabular-nums">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">step</TableHead>
                    <TableHead scope="col">regressions</TableHead>
                    <TableHead scope="col">improvements</TableHead>
                    <TableHead scope="col">largest regression</TableHead>
                    <TableHead scope="col">largest improvement</TableHead>
                    <TableHead scope="col">
                      <span className="sr-only">open in Compare</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {steps.map((step) => {
                    const compared = step.comparison.rows.length > 0;
                    return (
                      <TableRow key={`${step.from.id}→${step.to.id}`}>
                        <TableCell
                          className="font-medium"
                          title={`${describeRun(step.from)} → ${describeRun(step.to)}`}
                        >
                          {shortCommit(step.from.report.meta)}{" "}
                          <span className="text-muted-foreground/50">→</span>{" "}
                          {shortCommit(step.to.report.meta)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            step.regressions.length > 0
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {compared ? step.regressions.length : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            step.improvements.length > 0
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {compared ? step.improvements.length : "—"}
                        </TableCell>
                        <ChangeCell change={step.regressions[0]} />
                        <ChangeCell change={step.improvements[0]} />
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onCompare(step.from.id, step.to.id)}
                          >
                            Compare
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {unshared && (
                <Note>
                  — marks a step whose two runs share no backend, scenario, and
                  size, so nothing could be compared.
                </Note>
              )}
            </CardContent>
          </Card>

          {lines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{`${metric.label} per run`}</CardTitle>
                <CardDescription>
                  {`${where}. The badge is the change from the run before.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table className="tabular-nums">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">run</TableHead>
                      {lines.map((line) => (
                        <TableHead key={line.backend} scope="col">
                          <SeriesLabel color={line.color}>
                            {line.backend}
                          </SeriesLabel>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.map((run, index) => (
                      <TableRow key={run.id}>
                        <TableCell title={`${run.name}: ${provenance(run)}`}>
                          <span className="font-medium">
                            {shortCommit(run.report.meta)}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {formatDate(writtenAt(run.report.meta))}
                          </span>
                        </TableCell>
                        {lines.map((line) => {
                          const delta = deltaFor(index, line.backend);
                          return (
                            <TableCell key={line.backend}>
                              <span className="inline-flex items-center gap-2">
                                {formatValue(
                                  metric.unit,
                                  line.readings[index].value,
                                  metric.signed,
                                )}
                                {delta && <DeltaBadge delta={delta} />}
                              </span>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
