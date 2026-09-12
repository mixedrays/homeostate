# @homeostate/benchmark-ui

Private workspace package: a browser viewer for the reports `@homeostate/benchmark` saves with
`--json`. It answers the same two questions as the Markdown report, visually:

- how the backends compare with each other at a given state size and operation, and
- how one backend behaves before and after a change in core.

## Run

```bash
pnpm bench -- --json results/main.json            # save a report first
pnpm bench:ui                                      # viewer on http://localhost:5180
pnpm --filter @homeostate/benchmark-ui build       # static site in dist/, reports bundled in
```

## Loading reports

Every `packages/benchmark/results/*.json` is picked up automatically. In development the folder
is watched, so a report saved while the page is open appears without a reload; a production build
bundles whatever the folder holds at build time. Any other report can be dropped onto the page or
opened with the **Open JSON** button, and several reports can be loaded at once. The run selector
in the header switches between them; runs are labelled by commit, date, and file name, with a
badge when the tree was dirty.

Files are validated on load and a malformed one is reported by name instead of breaking the page.

## Views

| tab | what it shows |
| --- | --- |
| Overview | four headline figures (slowest write, widest gap between backends, noisiest timing, heaviest wire per op) and a heatmap of one metric over every scenario, backend, and size |
| Operations | one state size at a time: a dot plot of a metric per scenario with a dot per backend, then the full table with write ± margin of error, p50, p99, vs best, roundtrip, wire, document, and heap growth per operation |
| Scaling | one scenario at a time: a metric against state size on log-log axes, one line per backend, and the fitted exponent `k` in `value ∝ todos^k` |
| Replicas | seed, adopt, document size, and heap per replica, per state size |
| Compare | a baseline run against the current one: regression and improvement counts, a heatmap of the change per cell, and `before → after (Δ%)` tables per size |

## Reading the charts

- Timings and byte counts span several orders of magnitude, so charts default to a
  logarithmic axis; the toggle switches to linear, and metrics with zero or negative values
  (document and heap deltas) fall back to linear on their own.
- Whiskers on a dot span the mean ± its relative margin of error, the same `±%` the CLI prints.
- Each backend keeps one color for the whole session, also across runs, so adding or removing
  a run never repaints the others. Hovering any row, point, or cell lists every backend's value.
- The heatmap colors cells by log rank within the chosen metric; a dash marks a cell the run
  did not measure, such as `toggle-all` above its 1000-todo cap.
- The Compare tab uses `compareReports` from `@homeostate/benchmark`, so a change is
  significant under the same rule as `pnpm bench -- --compare`: beyond the threshold and, for
  timings, beyond both runs' margins of error; byte metrics must also move by a small absolute
  amount. Every metric is better when lower, so red is a regression and blue an improvement.

## Layout

```
src/lib/        pure modules: metrics, scales, palette, color math, run parsing, results discovery
src/components/ DotPlot, LineChart, Heatmap, Legend, Tooltip, MetaStrip, toolbar composites
src/components/ui/ shadcn/ui components on Base UI, managed with `npx shadcn add`
src/views/      one component per tab
src/__tests__/  vitest specs for the pure modules and a render pass over every view
```

`@homeostate/benchmark` exposes `./report` and `./types` for the browser; `report.ts` carries the
formatters and the comparison and imports nothing from Node.
