# @homeostate/benchmark-ui

Private browser viewer for the reports the two benchmarks save with `--json`.

```bash
pnpm bench:crdt -- --json results/main.json        # the backend matrix
pnpm bench:store -- --json results/quick.json      # the adapter render counts
pnpm bench:ui                                      # viewer on http://localhost:5180
pnpm --filter @homeostate/benchmark-ui build       # static site in dist/, reports bundled in
```

## Loading reports

| folder                                | saved by                     | shown in                                         |
| ------------------------------------- | ---------------------------- | ------------------------------------------------ |
| `apps/benchmark-crdt/results/*.json`  | `pnpm bench:crdt -- --json`  | Overview, Operations, Scaling, Replicas, Compare |
| `apps/benchmark-store/results/*.json` | `pnpm bench:store -- --json` | Renders                                          |

Both folders are watched in development, so a new report appears without a reload. Reports can
also be dropped onto the page or opened with **Open JSON**.

## Views

| tab        | what it shows                                                                   |
| ---------- | ------------------------------------------------------------------------------- |
| Overview   | headline figures and a heatmap of one metric over every scenario, backend, size |
| Operations | one state size: a dot plot per scenario and the full table                      |
| Scaling    | one scenario: a metric against state size on log-log axes, one line per backend |
| Replicas   | seed, adopt, document size and heap per replica                                 |
| Compare    | a baseline run against the current one, with the same rule as `--compare`       |
| Renders    | row renders per adapter, scenario and size, with the advisory timings           |

Charts default to a logarithmic axis. Whiskers show the mean ± margin of error. Lower is
better for every metric, so red is a regression and blue an improvement.

## Layout

```
src/lib/           pure modules: metrics, scales, palette, color math, run parsing, results discovery
src/components/    charts, tooltip, legend, stat tiles and toolbar controls
src/components/ui/ shadcn/ui components on Base UI, managed with `npx shadcn add`
src/views/         one component per tab
src/hooks/         React hooks shared by the views
src/__tests__/     vitest specs for the pure modules and a render pass over every view
```
