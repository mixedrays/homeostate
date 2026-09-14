# @homeostate/benchmark-ui

Private workspace package: a browser viewer for the reports the two benchmarks save with
`--json`. It answers three questions visually:

- how the backends compare with each other at a given state size and operation,
- how one backend behaves before and after a change in core, and
- how many components each adapter re-renders for one change from a peer.

## Run

```bash
pnpm bench -- --json results/main.json             # the backend matrix
pnpm bench:render -- --json results/quick.json     # the adapter render counts
pnpm bench:ui                                      # viewer on http://localhost:5180
pnpm --filter @homeostate/benchmark-ui build       # static site in dist/, reports bundled in
```

## Loading reports

Two folders are picked up automatically, one per benchmark:

| folder | saved by | shown in |
| --- | --- | --- |
| `packages/benchmark/results/*.json` | `pnpm bench -- --json` | Overview, Operations, Scaling, Replicas, Compare |
| `packages/benchmark-render/results/*.json` | `pnpm bench:render -- --json` | Renders |

The two report shapes are different measurements — backends against bytes and milliseconds,
adapters against component counts — so they are kept as separate kinds of run rather than merged
into one. Which folder a file sits in decides how it is read; a file that does not match its
folder is listed by name as an error rather than breaking the page.

In development both folders are watched, so a report saved while the page is open appears without
a reload; a production build bundles whatever they hold at build time. Any report can also be
dropped onto the page or opened with the **Open JSON** button — a dropped file is whichever of the
two kinds it parses as — and several can be loaded at once. The run selector in the header
switches between backend runs and the one in the Renders tab between render runs; runs are
labelled by commit, date, and file name, with a badge when the tree was dirty.

## Views

| tab | what it shows |
| --- | --- |
| Overview | four headline figures (slowest write, widest gap between backends, noisiest timing, heaviest wire per op) and a heatmap of one metric over every scenario, backend, and size |
| Operations | one state size at a time: a dot plot of a metric per scenario with a dot per backend, then the full table with write ± margin of error, p50, p99, vs best, roundtrip, renders and wasted renders per op, wire, document, and heap growth per operation |
| Scaling | one scenario at a time: a metric against state size on log-log axes, one line per backend, and the fitted exponent `k` in `value ∝ todos^k` |
| Replicas | seed, adopt, document size, and heap per replica, per state size |
| Compare | a baseline run against the current one: regression and improvement counts, a heatmap of the change per cell, and `before → after (Δ%)` tables per size |
| Renders | the render benchmark: row renders per adapter, scenario and size as a heatmap, and the full table with list, search box and footer renders beside the advisory apply, commit and mount timings |

## Reading the charts

- Timings and byte counts span several orders of magnitude, so charts default to a
  logarithmic axis; the toggle switches to linear, and metrics with zero or negative values
  (document and heap deltas) fall back to linear on their own.
- Whiskers on a dot span the mean ± its relative margin of error, the same `±%` the CLI prints.
- Each backend keeps one color for the whole session, also across runs, so adding or removing
  a run never repaints the others. Hovering any row, point, or cell lists every backend's value.
- The heatmap colors cells by log rank within the chosen metric; a dash marks a cell the run
  did not measure, such as `toggle-all` above its 1000-todo cap.
- Render counts are integers, not measurements: they do not vary between machines or runs, they
  carry no margin of error, and the Compare tab treats any change in `renders / op` as
  significant with no threshold. The Renders heatmap colors a cell by the share of the list it
  re-renders rather than by rank, so re-rendering the whole list never looks like being slightly
  worse than ideal.
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

`@homeostate/benchmark` exposes `./report` and `./types` for the browser and
`@homeostate/benchmark-render` exposes `./types`; `report.ts` carries the formatters and the
comparison and imports nothing from Node.
