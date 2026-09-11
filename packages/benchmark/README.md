# @homeostate/benchmark

Private workspace package that measures `@homeostate/core` driving every `CrdtBackend`
implementation the workspace has. It answers two questions with the same report:

- how do the backends compare with each other at a given state size and operation, and
- how does one backend behave before and after a change in core.

## Run

```bash
pnpm bench                                  # full matrix, roughly ten minutes
pnpm bench -- --quick                       # smoke run, well under a minute
pnpm bench -- -b yjs,memory -s toggle,remove -n 1000
pnpm bench -- --list                        # backends and scenarios
pnpm bench -- --help
```

Progress is written to stderr and the Markdown report to stdout, so `pnpm bench > report.md`
leaves a pasteable document.

## View in the browser

```bash
pnpm bench -- --json results/main.json
pnpm bench:ui                               # http://localhost:5180
```

`@homeostate/benchmark-ui` picks up every `results/*.json`, draws the matrix as dot plots, scaling
curves, and heatmaps, and compares two runs with the same significance rule as `--compare`. See
[packages/benchmark-ui/README.md](../benchmark-ui/README.md).

## Compare a backend across core changes

```bash
pnpm bench -- --json results/main.json                      # on main
# ... change core ...
pnpm bench -- --compare results/main.json --json results/change.json
pnpm bench -- --compare results/main.json --fail-on 15     # exit 1 on a regression beyond 15 %
```

The JSON records the commit, whether the tree was dirty, the Node and Yjs versions, and the
run options. The comparison joins rows by backend, scenario, and size, prints
`before → after (Δ%)`, and marks ▲ regressions and ▼ improvements that exceed `--threshold`
(default 5 %) and, for timings, both runs' margins of error. Byte metrics must also move by a
small absolute amount (8 B per operation, 64 B of document, 512 B of heap per operation, 4 KB
of heap per replica), because Yjs encodings and heap snapshots jitter by a few bytes.
`results/` is ignored by git; numbers are machine specific, so compare runs from the same
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
| wire / op | bytes over the wire per operation |
| doc Δ / op | growth of the encoded document per operation |
| heap Δ / op | retained heap growth of one writing peer per operation, over up to 200 operations or one second; coarse |

Scenarios that drift in size (`add`, `remove`, `keystroke`) restore the steady size before
each iteration. The restore is untimed and excluded from wire and document figures; the heap
figure includes it.

## Backends

| name | what it is |
| --- | --- |
| `passthrough` | keeps the state by reference, no cloning or encoding; the engine's own cost, a floor for the others |
| `memory` | `createMemoryBackend` from core; peers receive the whole state as a JSON string |
| `yjs` | `createYjsBackend` over a `Y.Map`; peers exchange Yjs updates |
| `loro` | `createLoroBackend` over a `LoroMap`; peers exchange Loro updates; the document figure is a Loro snapshot |
| `automerge` | `createAutomergeBackend` over an Automerge document; peers exchange encoded Automerge changes; the document figure is `A.save` |

## Scenarios

`toggle`, `keystroke`, `paste`, `search`, `add`, `remove`, `move`, `toggle-all`, and
`replace`; `pnpm bench -- --list` prints what each does. `toggle-all` and `replace` change
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
and the report shows `—`. The same pieces are exported from `@homeostate/benchmark`, so a
backend package can also register its own candidate and call `runBenchmark` from a script
of its own.

## Notes

- Timings come from tinybench: warm-up per task, then `--time` milliseconds and at least
  `--samples` samples.
- Heap figures need a garbage collector handle; the harness obtains one through V8 flags at
  runtime, so no `--expose-gc` is required.
- Every roundtrip and footprint pass asserts that both stores converged, so a candidate that
  does not replicate correctly fails the run instead of producing numbers.
