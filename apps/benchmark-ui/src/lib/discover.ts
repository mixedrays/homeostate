import type { BenchmarkReport } from "@homeostate/benchmark-crdt/types";
import type { RenderReport } from "@homeostate/benchmark-store/types";
import { isRenderReport, type RenderRun } from "./render-runs";
import { isReport, type Run } from "./runs";

const backendModules = import.meta.glob<BenchmarkReport>(
  "../../../benchmark-crdt/results/*.json",
  {
    import: "default",
  },
);

const renderModules = import.meta.glob<RenderReport>(
  "../../../benchmark-store/results/*.json",
  {
    import: "default",
  },
);

const load = async <Report, Loaded>(
  modules: Record<string, () => Promise<Report>>,
  valid: (value: unknown) => boolean,
  kind: string,
  build: (name: string, report: Report) => Loaded,
): Promise<{ loaded: Loaded[]; errors: string[] }> => {
  const loaded: Loaded[] = [];
  const errors: string[] = [];
  await Promise.all(
    Object.entries(modules).map(async ([path, read]) => {
      const name = path.slice(path.lastIndexOf("/") + 1);
      try {
        const report = await read();
        if (!valid(report)) throw new Error(`not a ${kind} report`);
        loaded.push(build(name, report));
      } catch (error) {
        errors.push(
          `${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );
  return { loaded, errors };
};

/**
 * Reports saved under `apps/benchmark-crdt/results` and `apps/benchmark-store/results`,
 * bundled at build time and hot-reloaded in dev. A file in one folder is never read as the
 * other kind of report: the two are told apart by where they are saved, and a file that does
 * not match its folder is listed as an error rather than silently dropped.
 */
export const discoverRuns = async (): Promise<{
  runs: Run[];
  renderRuns: RenderRun[];
  errors: string[];
}> => {
  const [backend, render] = await Promise.all([
    load(backendModules, isReport, "benchmark", (name, report) => ({
      kind: "backend" as const,
      id: `results:${name}`,
      name,
      source: "results" as const,
      report,
    })),
    load(renderModules, isRenderReport, "render", (name, report) => ({
      kind: "render" as const,
      id: `render-results:${name}`,
      name,
      source: "results" as const,
      report,
    })),
  ]);

  return {
    runs: backend.loaded,
    renderRuns: render.loaded,
    errors: [...backend.errors, ...render.errors],
  };
};
