# @homeostate/benchmark-store

Private workspace package that measures what happens **after** `adapter.setState`. Where
[`@homeostate/benchmark-crdt`](../benchmark-crdt/README.md) ends at the store, this one mounts a real
React tree per adapter, applies one change on a second peer, and counts the components React
re-renders.

Covers `redux`, `zustand`, `mobx-state-tree` and `mobx` over the Yjs backend today; `jotai`,
`valtio` and `tanstack-store` are the obvious next fixtures.

## Run

```bash
pnpm bench:store                                   # redux and mobx, toggle, 200/1000/4000 rows
pnpm bench:store -- -a mobx -n 1000
pnpm bench:store -- -s toggle,search,move -n 200
pnpm bench:store -- --json results/render.json
pnpm bench:store -- --list
pnpm bench:store -- --help
```

Progress goes to stderr and the Markdown report to stdout. `pnpm test` runs the same
measurements as assertions.

A report saved into `results/` also shows up in the viewer, under its own tab:

```bash
pnpm bench:store -- --json results/quick.json
pnpm bench:ui                                    # http://localhost:5180, Renders tab
```

## What it reports

One remote `toggle` at 200 rows, on this machine:

| adapter         | row renders | list  | apply  | commit | mount   |
| --------------- | ----------- | ----- | ------ | ------ | ------- |
| redux           | 1           | 1     | 1.5 ms | 3.8 ms | 22.4 ms |
| zustand         | 1           | 1     | 0.7 ms | 2.3 ms | 14.0 ms |
| mobx-state-tree | 1           | **0** | 2.5 ms | 0.6 ms | 18.5 ms |
| mobx            | 1           | **0** | 1.3 ms | 0.5 ms | 7.2 ms  |

All four re-render the one row that changed. The whole matrix, at 200 rows, is where they
separate:

| scenario, 200 rows          | redux                                  | zustand | mobx-state-tree | mobx |
| --------------------------- | -------------------------------------- | ------- | --------------- | ---- |
| toggle                      | 1                                      | 1       | 1               | 1    |
| keystroke                   | 1                                      | 1       | 1               | 1    |
| add                         | 1 (the new row mounts)                 | 1       | 1               | 1    |
| remove                      | 0                                      | 0       | 0               | 0    |
| move                        | 1                                      | 1       | **200**         | 1    |
| search (a top-level string) | 0, and the list does not render either | 0       | 0               | 0    |

One finding is left in that table.

**`store-mobx-state-tree` is the best of the four until the list is reordered.** Because
`applySnapshot` reconciles a node carrying an identifier in place, a toggle re-renders the one
row and not even the list container. A `move` is the exception: an array is reconciled by
position, so shifting every element rewrites every node. It is also the most expensive to
apply, and the gap widens with the list: 39 ms of apply and 154 ms of commit for a move at
1000 rows, against 1 ms and 2 ms for the immutable stores.

`store-mobx` used to be the headline here: it re-rendered **every** row on **every** change,
at every size, including a change that touched no todo at all, because `setState` assigned
whole plain arrays into observable fields. It now applies core's edit script to the observable
tree in place, which is why it joins MST in leaving the list container alone on an edit — and
why it keeps the Redux column on `move`, where MST does not. This benchmark was the acceptance
test for that change; the numbers above are what it now asserts.

### Columns

| column         | meaning                                                                              |
| -------------- | ------------------------------------------------------------------------------------ |
| row renders    | row components React re-rendered for the change. The metric and the gate; ideal 1    |
| list           | whether the list container itself re-rendered, 0 or 1                                |
| search, footer | the two components outside the list, as a check that a change stays where it belongs |
| apply          | the peer's write until this peer's store has settled, React excluded; advisory       |
| commit         | React's render and commit for that change; advisory                                  |
| mount          | first render of the whole list, the `adopt` analogue; advisory                       |

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
for its library**: `React.memo` plus a `useSelector` per component for Redux, the same with
`useStore` for Zustand, `observer()` on every component for MobX and MST. Deriving a value is
memoized idiomatically too — a selector, a `computed` getter, an MST view — so the only thing
left to differ is what the adapter does to identity.

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
  name: "zustand",
  description: "...",
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
  all come from `@homeostate/benchmark-crdt`, so the two benchmarks cannot drift apart on what a
  `toggle` is.
- MobX runs with `enforceActions: 'never'`: the adapter writes inside `runInAction`, but a
  fixture seeds its store directly.
