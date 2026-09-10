import { parseArgs } from 'node:util';
import { candidates as allCandidates } from './candidates.js';
import { scenarios as allScenarios } from './scenarios.js';
import type { BackendCandidate, BenchmarkOptions, Scenario } from './types.js';

export const DEFAULT_SIZES = [100, 1000, 5000];

export interface CliOptions extends Omit<BenchmarkOptions, 'onProgress'> {
  json: string | null;
  compare: string | null;
  /** Regression threshold as a ratio; `null` disables the non-zero exit code. */
  failOn: number | null;
  threshold: number;
  list: boolean;
  help: boolean;
}

export const HELP = `Usage: pnpm bench [options]

Runs every backend candidate through every scenario at every size, then prints a report.

  -b, --backend <names>    comma-separated candidates (default: all)
  -s, --scenario <names>   comma-separated scenarios (default: all)
  -n, --size <numbers>     comma-separated todo counts (default: ${DEFAULT_SIZES.join(',')})
  -t, --time <ms>          time tinybench spends per task (default: 250)
      --samples <n>        minimum samples per task (default: 10)
      --operations <n>     operations per footprint pass (default: 20)
      --no-memory          skip heap measurements
      --quick              short run: 50 ms per task, 4 samples, 5 operations, sizes 100,1000
      --json <file>        also save the report as JSON
      --compare <file>     compare against a report saved with --json
      --threshold <pct>    mark changes beyond this percentage (default: 5)
      --fail-on <pct>      with --compare, exit 1 on a regression beyond this percentage
      --list               print candidates and scenarios, then exit
  -h, --help
`;

const pick = <T extends { name: string }>(
  kind: string,
  available: T[],
  requested: string | undefined
): T[] => {
  if (requested === undefined) return available;
  return requested.split(',').map((name) => {
    const item = available.find((candidate) => candidate.name === name.trim());
    if (!item)
      throw new Error(
        `Unknown ${kind} "${name.trim()}"; available: ${available.map((a) => a.name).join(', ')}`
      );
    return item;
  });
};

const integer = (flag: string, value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`--${flag} expects a positive integer, got "${value}"`);
  return parsed;
};

const percent = (flag: string, value: string | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error(`--${flag} expects a non-negative percentage, got "${value}"`);
  return parsed / 100;
};

export const parseOptions = (
  argv: string[],
  registry: { candidates: BackendCandidate[]; scenarios: Scenario[] } = {
    candidates: allCandidates,
    scenarios: allScenarios,
  }
): CliOptions => {
  const { values } = parseArgs({
    args: argv[0] === '--' ? argv.slice(1) : argv,
    options: {
      backend: { type: 'string', short: 'b' },
      scenario: { type: 'string', short: 's' },
      size: { type: 'string', short: 'n' },
      time: { type: 'string', short: 't' },
      samples: { type: 'string' },
      operations: { type: 'string' },
      memory: { type: 'boolean', default: true },
      quick: { type: 'boolean', default: false },
      json: { type: 'string' },
      compare: { type: 'string' },
      threshold: { type: 'string' },
      'fail-on': { type: 'string' },
      list: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowNegative: true,
  });

  const sizes =
    values.size === undefined
      ? values.quick
        ? DEFAULT_SIZES.slice(0, 2)
        : DEFAULT_SIZES
      : values.size.split(',').map((size) => integer('size', size.trim(), 0));

  return {
    candidates: pick('backend', registry.candidates, values.backend),
    scenarios: pick('scenario', registry.scenarios, values.scenario),
    sizes,
    time: integer('time', values.time, values.quick ? 50 : 250),
    minSamples: integer('samples', values.samples, values.quick ? 4 : 10),
    operations: integer('operations', values.operations, values.quick ? 5 : 20),
    memory: values.memory,
    json: values.json ?? null,
    compare: values.compare ?? null,
    failOn: percent('fail-on', values['fail-on']),
    threshold: percent('threshold', values.threshold) ?? 0.05,
    list: values.list,
    help: values.help,
  };
};

export const describeRegistry = (registry: {
  candidates: BackendCandidate[];
  scenarios: Scenario[];
}): string => {
  const pad = Math.max(
    ...registry.candidates.map((c) => c.name.length),
    ...registry.scenarios.map((s) => s.name.length)
  );
  const line = (item: { name: string; description: string }) =>
    `  ${item.name.padEnd(pad)}  ${item.description}`;
  return [
    'Backends:',
    ...registry.candidates.map(line),
    '',
    'Scenarios:',
    ...registry.scenarios.map((scenario) =>
      scenario.maxSize === undefined ? line(scenario) : `${line(scenario)} (up to ${scenario.maxSize} todos)`
    ),
  ].join('\n');
};
