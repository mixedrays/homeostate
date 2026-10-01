# @homeostate/benchmark-crdt

Private package that measures `@homeostate/core` driving every `CrdtBackend` in the workspace:
how the backends compare with each other, and how one backend changes across a change in core.

## Run

```bash
pnpm bench:crdt                             # full matrix, roughly ten minutes
pnpm bench:crdt -- --quick                  # smoke run, under a minute
pnpm bench:crdt -- -b yjs,memory -s toggle,remove -n 1000
pnpm bench:crdt -- --list                   # backends and scenarios
pnpm bench:crdt -- --help
```

Progress goes to stderr and the Markdown report to stdout, so `pnpm bench:crdt > report.md`
leaves a pasteable document.

## Save, view and compare

```bash
pnpm bench:crdt -- --json results/main.json                     # on main
# ... change core ...
pnpm bench:crdt -- --compare results/main.json --json results/change.json
pnpm bench:crdt -- --compare results/main.json --fail-on 15     # exit 1 on a regression beyond 15 %
pnpm bench:ui                                                   # view results/*.json in the browser
```

A comparison prints `before → after (Δ%)` per backend, scenario and size, and marks ▲
regressions and ▼ improvements beyond `--threshold` (default 5 %) and, for timings, beyond both
runs' margins of error. Render counts are exact, so any change in them is reported. `results/`
is git-ignored; compare runs from the same machine.

## What is measured

A **peer** is a minimal store, a `createSyncEngine`, and one **replica** of a backend. Two
replicas can be linked by an in-process **wire** that counts bytes. Only the write is timed.

Per backend and size:

| column         | meaning                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| seed           | `connect()` of a store holding N todos against an empty backend                   |
| adopt          | `connect()` of an empty store against a replica that already received the N todos |
| doc size       | encoded document after seeding, in the backend's own format                       |
| heap / replica | retained heap of one peer, store state included, averaged over up to 20 peers     |

Per backend, scenario, and size:

| column       | meaning                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| write        | store change to `backend.write` on a single peer, mean ± relative margin of error                       |
| p99          | 99th percentile of write                                                                                |
| vs best      | write mean relative to the fastest backend for that scenario and size                                   |
| roundtrip    | store change on peer A until peer B's store holds it: B's `read`, `patchState`, `setState` included     |
| renders / op | rows of peer B that survived the operation and came back as a new object, matched by `id`               |
| wasted / op  | of those, the rows whose data is deep-equal, so the new object carried nothing new                      |
| wire / op    | bytes over the wire per operation                                                                       |
| doc Δ / op   | growth of the encoded document per operation                                                            |
| heap Δ / op  | retained heap growth of one writing peer per operation, over up to 200 operations or one second; coarse |

Timings stop at `adapter.setState`: no state manager, adapter or React is measured. That is
[`@homeostate/benchmark-store`](../benchmark-store/README.md)'s job. `renders / op` and
`wasted / op` are the upper bound on memoized row components a correct UI re-renders, so they
catch a core change that stops sharing unchanged subtrees;
`src/__tests__/identity.test.ts` asserts them.

## Backends and scenarios

| name          | what it is                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `passthrough` | keeps the state by reference, no cloning or encoding; the engine's own cost, a floor for the others                            |
| `memory`      | `createMemoryBackend` from `@homeostate/core/testing`; peers receive the whole state as a JSON string                          |
| `yjs`         | `createYjsBackend` over a `Y.Map`; peers exchange Yjs updates                                                                  |
| `loro`        | `createLoroBackend` over a `LoroMap`; peers exchange Loro updates; the document figure is a Loro snapshot                      |
| `automerge`   | `createAutomergeBackend` over an Automerge document; peers exchange encoded Automerge changes; the document figure is `A.save` |

Scenarios: `toggle`, `keystroke`, `paste`, `search`, `add`, `remove`, `move`, `toggle-all`
and `replace`; `--list` describes each. `toggle-all` and `replace` hit the worst case of
core's array diff, so they are capped at 1000 todos and skipped at larger sizes.

## Adding a backend

Implement `BackendCandidate` in `src/candidates.ts` and add it to `candidates`:

```ts
export const automerge: BackendCandidate<AutomergeReplica> = {
  name: "automerge",
  description: "...",
  createReplica: () => ({
    backend,
    encodedSize: () => save(doc).byteLength,
    destroy,
  }),
  connect: (a, b) => ({ bytes: () => transferred, disconnect }),
};
```

`encodedSize` and `bytes` are optional; without them the report shows `—`. Every roundtrip
asserts that both stores converged, so a backend that does not replicate correctly fails the
run. Compare state with the exported `deepEqual`, not `JSON.stringify`: Loro and Automerge
reorder object keys.
