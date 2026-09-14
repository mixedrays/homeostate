# @homeostate/benchmark-render

Private workspace package that measures what happens **after** `adapter.setState`. Where
[`@homeostate/benchmark`](../benchmark/README.md) ends at the store, this one mounts a real
React tree per adapter, applies one change on a second peer, and counts the components React
re-renders.

Covers `redux` and `mobx` over the Yjs backend today; the remaining five adapters are the
obvious next fixtures.

## Run

```bash
pnpm bench:render                                   # redux and mobx, toggle, 200/1000/4000 rows
pnpm bench:render -- -a mobx -n 1000
pnpm bench:render -- -s toggle,search,move -n 200
pnpm bench:render -- --json results/render.json
pnpm bench:render -- --list
pnpm bench:render -- --help
```

Progress goes to stderr and the Markdown report to stdout. `pnpm test` runs the same
measurements as assertions.

A report saved into `results/` also shows up in the viewer, under its own tab:

```bash
pnpm bench:render -- --json results/quick.json
pnpm bench:ui                                    # http://localhost:5180, Renders tab
```

## What it reports

One remote `toggle` at 1000 rows, on this machine:

| adapter | row renders | list | apply | commit | mount |
| --- | --- | --- | --- | --- | --- |
| redux | 1 | 1 | 1.6 ms | 8.6 ms | 42.6 ms |
| **mobx** | **1000** | 1 | 7.6 ms | 26.0 ms | 37.6 ms |

`redux` re-renders the one row that changed at every size. `adapter-mobx` re-renders **every
row of the list on every change**, at every size, including a change that touches no todo at
all:

| scenario, 200 rows | redux | mobx |
| --- | --- | --- |
| toggle | 1 | 200 |
| keystroke | 1 | 200 |
| add | 1 (the new row mounts) | 201 |
| remove | 0 | 199 |
| move | 1 | 200 |
| search (a top-level string) | 0, and the list does not render either | 200 |

The cause is `packages/adapter-mobx/src/adapter.ts:48-52`: `setState` assigns whole plain
arrays into observable fields, so every row becomes a new observable object, whatever core
handed the adapter. Core's side is optimal — the write-path benchmark's `renders / op` column
reports 1, 1, 0, 0 and 1 for the same scenarios — so the whole difference is the adapter's.
Reconciling in place instead of assigning is what would fix it, and this benchmark is the
acceptance test for that change.

### Columns

| column | meaning |
| --- | --- |
| row renders | row components React re-rendered for the change. The metric and the gate; ideal 1 |
| list | whether the list container itself re-rendered, 0 or 1 |
| search, footer | the two components outside the list, as a check that a change stays where it belongs |
| apply | the peer's write until this peer's store has settled, React excluded; advisory |
| commit | React's render and commit for that change; advisory |
| mount | first render of the whole list, the `adopt` analogue; advisory |

Counts are exact integers: identical on every machine, in every run, which is what makes them
usable as a gate with no threshold to tune. The timings are advisory and are not asserted by
anything — React's commit time depends on the fixture's DOM, on jsdom, and on the machine, and
the difference that matters here is 1 versus 1000, not 1.2 ms versus 1.4 ms.

## The fixtures are the benchmark

Every fixture renders the same tree:

```
App → SearchBox, List → Row × N, Footer
```

Each component increments a counter when it renders, and each is memoized **the idiomatic way
for its library**: `React.memo` plus a `useSelector` per component for Redux, `observer()` on
every component for MobX. Deriving a value is memoized idiomatically too — a selector on one
side, a `computed` getter on the other — so the only thing left to differ is what the adapter
does to identity.

This is the one way the benchmark could lie. Put `observer` on the list alone and MobX scores
one row render, because there is only one row component to count. So a fixture has to render
one component per row, `measure` throws when it does not, and every number above is one an
independent probe measured first.

The driver puts the two peers on a real Yjs document with a synchronous wire, so the rows a
fixture mounts have been encoded and decoded rather than shared by reference from the writer.

## Adding an adapter

Add a fixture next to the others in `src/fixtures/` and register it in `src/fixtures/index.ts`:

```tsx
export const zustand: Fixture = {
  name: 'zustand',
  description: '...',
  create: (initial) => ({ adapter, tree: <App />, counters }),
};
```

`create` is handed the initial state, builds its own store, and returns the adapter the sync
engine drives, the tree to mount, and the counters its components increment. Everything else —
the peers, the scenarios, the report — is shared.

## Notes

- `pnpm test` runs the counts as assertions through Vitest's jsdom environment; the CLI
  installs jsdom itself, before `react-dom` is imported.
- The scenarios, the inert writer store, the report renderer and the structural `deepEqual`
  all come from `@homeostate/benchmark`, so the two benchmarks cannot drift apart on what a
  `toggle` is.
- MobX runs with `enforceActions: 'never'`: the adapter writes inside `runInAction`, but a
  fixture seeds its store directly.
