import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { scenarios as allScenarios } from '@homeostate/benchmark';
import type { Scenario } from '@homeostate/benchmark';
import { installDom } from './dom.js';
import { fixtures as allFixtures } from './fixtures/index.js';
import { collectMeta } from './meta.js';
import { renderRenderReport } from './report.js';
import type { Fixture } from './types.js';

const DEFAULT_SIZES = [200, 1000, 4000];

const HELP = `Usage: pnpm bench:render [options]

Mounts one React tree per adapter over N todos, applies one change on a second peer, and
counts the components React re-renders. Counts are the metric; the timings are advisory.

  -a, --adapter <names>    comma-separated adapters (default: all)
  -s, --scenario <names>   comma-separated scenarios (default: toggle)
  -n, --size <numbers>     comma-separated todo counts (default: ${DEFAULT_SIZES.join(',')})
      --json <file>        also save the report as JSON
      --list               print adapters and scenarios, then exit
  -h, --help
`;

const pick = <T extends { name: string }>(kind: string, available: T[], requested: string | undefined): T[] => {
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

const describe = (fixtures: Fixture[], scenarios: Scenario[]): string => {
  const pad = Math.max(...[...fixtures, ...scenarios].map((item) => item.name.length));
  const line = (item: { name: string; description: string }): string =>
    `  ${item.name.padEnd(pad)}  ${item.description}`;
  return ['Adapters:', ...fixtures.map(line), '', 'Scenarios:', ...scenarios.map(line)].join('\n');
};

const main = async (): Promise<number> => {
  const { values } = parseArgs({
    args: process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2),
    options: {
      adapter: { type: 'string', short: 'a' },
      scenario: { type: 'string', short: 's' },
      size: { type: 'string', short: 'n' },
      json: { type: 'string' },
      list: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  const fixtures = pick('adapter', allFixtures, values.adapter);
  const scenarios = pick('scenario', allScenarios, values.scenario ?? 'toggle');

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.list) {
    process.stdout.write(`${describe(allFixtures, allScenarios)}\n`);
    return 0;
  }

  const sizes =
    values.size === undefined
      ? DEFAULT_SIZES
      : values.size.split(',').map((size) => {
          const parsed = Number(size.trim());
          if (!Number.isInteger(parsed) || parsed <= 0)
            throw new Error(`--size expects positive integers, got "${size.trim()}"`);
          return parsed;
        });

  // React decides at import time whether it is running in a browser, so the DOM has to exist
  // before the driver is loaded.
  installDom();
  const { runRenderBenchmark } = await import('./driver.js');

  const results = await runRenderBenchmark({
    fixtures,
    scenarios,
    sizes,
    onProgress: (done, total, label) => {
      process.stderr.write(`[${String(done).padStart(String(total).length)}/${total}] ${label}\n`);
    },
  });

  const report = { meta: collectMeta(), results };
  process.stdout.write(`${renderRenderReport(report)}\n`);

  if (values.json !== undefined) {
    mkdirSync(dirname(values.json), { recursive: true });
    writeFileSync(values.json, `${JSON.stringify(report, null, 2)}\n`);
    process.stderr.write(`Saved ${values.json}\n`);
  }

  return 0;
};

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
);
