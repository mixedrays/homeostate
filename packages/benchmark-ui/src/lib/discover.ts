import type { BenchmarkReport } from '@homeostate/benchmark/types';
import { isReport, type Run } from './runs';

const modules = import.meta.glob<BenchmarkReport>('../../../benchmark/results/*.json', {
  import: 'default',
});

/** Reports saved under `packages/benchmark/results`, bundled at build time and hot-reloaded in dev. */
export const discoverRuns = async (): Promise<{ runs: Run[]; errors: string[] }> => {
  const runs: Run[] = [];
  const errors: string[] = [];
  await Promise.all(
    Object.entries(modules).map(async ([path, load]) => {
      const name = path.slice(path.lastIndexOf('/') + 1);
      try {
        const report = await load();
        if (!isReport(report)) throw new Error('not a benchmark report');
        runs.push({ id: `results:${name}`, name, source: 'results', report });
      } catch (error) {
        errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );
  return { runs, errors };
};
