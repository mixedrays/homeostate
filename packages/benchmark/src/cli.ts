import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { candidates } from './candidates.js';
import { runBenchmark } from './harness.js';
import { describeRegistry, HELP, parseOptions } from './options.js';
import { compareReports, hasRegression, renderComparison, renderReport } from './report.js';
import { scenarios } from './scenarios.js';
import type { BenchmarkReport } from './types.js';

const main = async (): Promise<number> => {
  const options = parseOptions(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (options.list) {
    process.stdout.write(`${describeRegistry({ candidates, scenarios })}\n`);
    return 0;
  }

  const baseline: BenchmarkReport | null =
    options.compare === null
      ? null
      : (JSON.parse(readFileSync(options.compare, 'utf8')) as BenchmarkReport);

  const report = await runBenchmark({
    ...options,
    onProgress: (done, total, label) => {
      process.stderr.write(`[${String(done).padStart(String(total).length)}/${total}] ${label}\n`);
    },
  });

  process.stdout.write(`${renderReport(report)}\n`);

  if (options.json !== null) {
    mkdirSync(dirname(options.json), { recursive: true });
    writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
    process.stderr.write(`Saved ${options.json}\n`);
  }

  if (baseline === null) return 0;

  const comparison = compareReports(baseline, report, options.threshold);
  process.stdout.write(`\n${renderComparison(comparison)}\n`);

  if (options.failOn === null) return 0;
  const regressed = hasRegression(compareReports(baseline, report, options.failOn));
  if (regressed) process.stderr.write(`Regression beyond ${options.failOn * 100}% detected\n`);
  return regressed ? 1 : 0;
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
