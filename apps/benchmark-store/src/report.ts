import { formatDuration, table } from "@homeostate/benchmark-crdt/report";
import type { RenderReport, RenderResult } from "./types.js";

const renderMeta = (report: RenderReport): string => {
  const { meta } = report;
  const commit =
    meta.commit === null
      ? "unknown commit"
      : `${meta.commit}${meta.dirty ? " (dirty)" : ""}`;
  const versions = Object.entries(meta.versions)
    .map(([name, version]) => `${name} ${version}`)
    .join(", ");
  return [
    `Homeostate render benchmark · ${meta.date} · ${commit} · node ${meta.node}${versions ? ` · ${versions}` : ""}`,
    "Counts are exact and are the metric; the three timings are advisory and machine specific.",
  ].join("\n");
};

const renderScenario = (results: RenderResult[]): string =>
  table(
    [
      "adapter",
      "rows",
      "row renders",
      "list",
      "search",
      "footer",
      "apply",
      "commit",
      "mount",
    ],
    results.map((result) => [
      result.adapter,
      String(result.size),
      String(result.rowRenders),
      String(result.listRenders),
      String(result.searchBoxRenders),
      String(result.footerRenders),
      formatDuration(result.applyMs),
      formatDuration(result.commitMs),
      formatDuration(result.mountMs),
    ]),
  );

/**
 * One table per scenario, adapters in registry order and sizes ascending, which is the shape
 * the comparison is read in: the same adapter across sizes tells you whether its cost is
 * per change or per row.
 */
export const renderRenderReport = (report: RenderReport): string => {
  const scenarios = [
    ...new Set(report.results.map((result) => result.scenario)),
  ];
  const sections = [renderMeta(report)];

  for (const scenario of scenarios) {
    sections.push(`## ${scenario}`);
    sections.push(
      renderScenario(
        report.results.filter((result) => result.scenario === scenario),
      ),
    );
  }

  return sections.join("\n\n");
};
