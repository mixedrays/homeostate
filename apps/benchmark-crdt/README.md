# @homeostate/benchmark-crdt

Private workspace package that measures `@homeostate/core` driving every `CrdtBackend`
implementation the workspace has. It answers two questions with the same report:

- how do the backends compare with each other at a given state size and operation, and
- how does one backend behave before and after a change in core.

## Run

```bash
pnpm bench:crdt                             # full matrix, roughly ten minutes
pnpm bench:crdt -- --quick                  # smoke run, well under a minute
pnpm bench:crdt -- -b yjs,memory -s toggle,remove -n 1000
pnpm bench:crdt -- --list                   # backends and scenarios
pnpm bench:crdt -- --help
```

Progress is written to stderr and the Markdown report to stdout, so `pnpm bench:crdt > report.md`
leaves a pasteable document.

## View in the browser

```bash
pnpm bench:crdt -- --json results/main.json
pnpm bench:ui                               # http://localhost:5180
```

`@homeostate/benchmark-ui` picks up every `results/*.json`, draws the matrix as dot plots, scaling
curves, and heatmaps, and compares two runs with the same significance rule as `--compare`. The
render counts are one of the metrics it plots, and it reads the render benchmark's own reports
from `apps/benchmark-store/results` in a tab of their own. See
[apps/benchmark-ui/README.md](../benchmark-ui/README.md).

## Compare a backend across core changes

```bash
pnpm bench:crdt -- --json results/main.json                     # on main
# ... change core ...
pnpm bench:crdt -- --compare results/main.json --json results/change.json
pnpm bench:crdt -- --compare results/main.json --fail-on 15     # exit 1 on a regression beyond 15 %
```

The JSON records the commit, whether the tree was dirty, the Node and Yjs versions, and the
run options. The comparison joins rows by backend, scenario, and size, prints
`before → after (Δ%)`, and marks ▲ regressions and ▼ improvements that exceed `--threshold`
(default 5 %) and, for timings, both runs' margins of error. Byte metrics must also move by a
small absolute amount (8 B per operation, 64 B of document, 512 B of heap per operation, 4 KB
of heap per replica), because Yjs encodings and heap snapshots jitter by a few bytes. The
render counts are exempt from both rules: they are exact integers, so any change in them is
reported. `results/` is ignored by git; numbers are machine specific, so compare runs from the same
machine.

## What is measured

A **peer** is the smallest possible store, a `createSyncEngine`, and one **replica** of a
backend. Two replicas can be linked by a synchronous in-process **wire** that counts bytes.
Scenarios compute the next state in an untimed hook, so only the write is measured.

Per backend and size:

| column | meaning |
| --- | --- |
| seed | `connect()` of a store holding N todos against an empty backend |
| adopt | `connect()` of an empty store against a replica that already received the N todos |
| doc size | encoded document after seeding: Yjs state update or JSON bytes |
| heap / replica | retained heap of one peer, store state included, averaged over up to 20 peers |

Per backend, scenario, and size:

| column | meaning |
| --- | --- |
| write | store change to `backend.write` on a single peer, mean ± relative margin of error |
| p99 | 99th percentile of write |
| vs best | write mean relative to the fastest backend for that scenario and size |
| roundtrip | store change on peer A until peer B's store holds it: B's `read`, `patchState`, `setState` included |
| renders / op | rows of peer B that survived the operation and came back as a new object, matched by `id` |
| wasted / op | of those, the rows whose data is deep-equal, so the new object carried nothing new |
| wire / op | bytes over the wire per operation |
| doc Δ / op | growth of the encoded document per operation |
| heap Δ / op | retained heap growth of one writing peer per operation, over up to 200 operations or one second; coarse |

Scenarios that drift in size (`add`, `remove`, `keystroke`) restore the steady size before
each iteration. The restore is untimed and excluded from wire and document figures; the heap
figure includes it.

### Where the write path ends

Every timing here stops at `adapter.setState`. The store is deliberately the smallest thing
that satisfies `StoreAdapter`, so that it adds nothing to the numbers, which also means
nothing downstream of it is measured: no state manager, no adapter, no React. Two changes with
the same `roundtrip` can still differ by a factor of a thousand in the work a UI does
afterwards.

`renders / op` and `wasted / op` are the exception, and they are counts rather than timings.
They are read from a separate deterministic pass over one operation, outside every timed path,
by matching the receiving store's rows before and after **by `id`** — the way React reconciles
a keyed list. `applyChangesToArray` splices, which moves existing references, so matching by
index would report a change for most of the list after an insert or a delete even though no
component's data moved.

The counts are the strict upper bound on how many memoized row components any correct UI
re-renders, so a core change that stops sharing unchanged subtrees shows up here even though
every byte and every millisecond stays the same. They are integers that do not vary between
machines or runs, so `--compare` reports any change in them as significant, with no threshold
and no margin-of-error test. Today core is optimal on every backend: one row per `toggle`,
`keystroke` and `paste`, none for `search`, `add` or `remove`, and one wasted row for `move`,
which is inherent to pairing a delete with an insert in the array diff.

Rows a scenario added are not counted — they have to mount whatever core does — and neither
are rows it removed. What is counted is a surviving row handed to the store as a new object.
That is why `replace`, which swaps every todo for one with a fresh `id`, reports zero: no row
survives it, so there is nothing a memoized list could have kept. `toggle-all`, which changes
all N rows in place, reports N. `apps/benchmark-crdt/src/__tests__/identity.test.ts` asserts the
whole table as a gate.

What none of this covers is the adapter: whether a given state manager preserves that identity
on its way into components. That is measured against real React trees in
[`@homeostate/benchmark-store`](../benchmark-store/README.md).

## Backends

| name | what it is |
| --- | --- |
| `passthrough` | keeps the state by reference, no cloning or encoding; the engine's own cost, a floor for the others |
| `memory` | `createMemoryBackend` from core; peers receive the whole state as a JSON string |
| `yjs` | `createYjsBackend` over a `Y.Map`; peers exchange Yjs updates |
| `loro` | `createLoroBackend` over a `LoroMap`; peers exchange Loro updates; the document figure is a Loro snapshot |
| `automerge` | `createAutomergeBackend` over an Automerge document; peers exchange encoded Automerge changes; the document figure is `A.save` |

Backends disagree on the order of object keys after a roundtrip: `passthrough`, `memory` and
`yjs` return a todo with the order it was authored in (`id, title, completed`), while `loro`
and `automerge` alphabetize it (`completed, id, title`). The values are the same, so the
difference only matters to code that compares serialized state — `JSON.stringify` reports a
divergence where there is none. Use the structural `deepEqual` the package exports, which is
what convergence checks and `wasted / op` use.

`passthrough` also hands the peer the very same objects instead of a copy of them, so it is a
floor for `renders / op` as well as for the timings: its `move` costs no render at all, where
every encoding backend rebuilds the moved row.

## Scenarios

`toggle`, `keystroke`, `paste`, `search`, `add`, `remove`, `move`, `toggle-all`, and
`replace`; `pnpm bench:crdt -- --list` prints what each does. `toggle-all` and `replace` change
every element of the array, the worst case for the LCS array diff in core, which is
O((N+M)·D) in time and allocation. Such a write costs about 300 ms at 1000 todos and about
10 s at 5000, so both scenarios are capped at 1000 todos; pass `-n 5000 -s toggle-all` to
measure the pathology deliberately.

## Adding a backend

Implement `BackendCandidate` next to the others in `src/candidates.ts` and add it to
`candidates`:

```ts
export const automerge: BackendCandidate<AutomergeReplica> = {
  name: 'automerge',
  description: '...',
  createReplica: () => ({ backend, encodedSize: () => save(doc).byteLength, destroy }),
  connect: (a, b) => ({ bytes: () => transferred, disconnect }),
};
```

`encodedSize` and `bytes` are optional; leave them out when the backend has no wire format
and the report shows `—`. The same pieces are exported from `@homeostate/benchmark-crdt`, so a
backend package can also register its own candidate and call `runBenchmark` from a script
of its own.

## Notes

- Timings come from tinybench: warm-up per task, then `--time` milliseconds and at least
  `--samples` samples.
- Heap figures need a garbage collector handle; the harness obtains one through V8 flags at
  runtime, so no `--expose-gc` is required.
- Every roundtrip and footprint pass asserts that both stores converged, so a candidate that
  does not replicate correctly fails the run instead of producing numbers.
