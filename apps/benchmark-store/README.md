# @homeostate/benchmark-store

Private package that measures what happens after `adapter.setState`, where
[`@homeostate/benchmark-crdt`](../benchmark-crdt/README.md) stops. It mounts a real React tree
per store adapter, applies one change from a second peer over Yjs, and counts the components
React re-renders.

Covers `redux`, `zustand`, `mobx-state-tree` and `mobx`.

## Run

```bash
pnpm bench:store                                   # every adapter, toggle, 200/1000/4000 rows
pnpm bench:store -- -a mobx -n 1000
pnpm bench:store -- -s toggle,search,move -n 200
pnpm bench:store -- --json results/render.json    # also shown by pnpm bench:ui, Renders tab
pnpm bench:store -- --list
pnpm bench:store -- --help
```

Progress goes to stderr and the Markdown report to stdout. `pnpm test` runs the same
measurements as assertions.

## Columns

| column         | meaning                                                                              |
| -------------- | ------------------------------------------------------------------------------------ |
| row renders    | row components React re-rendered for the change. The metric and the gate; ideal 1    |
| list           | whether the list container itself re-rendered, 0 or 1                                |
| search, footer | the two components outside the list, as a check that a change stays where it belongs |
| apply          | the peer's write until this peer's store has settled, React excluded; advisory       |
| commit         | React's render and commit for that change; advisory                                  |
| mount          | first render of the whole list, the `adopt` analogue; advisory                       |

Counts are exact integers, identical on every machine and run, so they gate with no
threshold. Timings are advisory and not asserted.

## Fixtures

Every fixture renders the same tree, `App → SearchBox, List → Row × N, Footer`, and each
component counts its renders. Components are memoized the idiomatic way for their library
(`React.memo` with a selector per component for Redux and Zustand, `observer()` for MobX and
MST), so the only difference left is what the adapter does to identity. A fixture must render
one component per row; `measure` throws otherwise.

To add an adapter, add a fixture in `src/fixtures/` and register it in
`src/fixtures/index.ts`:

```tsx
export const zustand: Fixture = {
  name: "zustand",
  description: "...",
  create: (initial) => ({ adapter, tree: <App />, counters }),
};
```

`create` builds its own store from the initial state and returns the adapter, the tree to
mount, and its counters. The peers, scenarios and report are the same for every fixture.
