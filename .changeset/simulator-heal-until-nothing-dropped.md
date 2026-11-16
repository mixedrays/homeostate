---
"@homeostate/tool-simulator": patch
---

`runRandomized` no longer reports peers that converge as diverged when updates written after
its final heal are dropped. With a `dropRate`, a store that writes in answer to remote changes,
such as a subscriber that keeps a derived key in synced state, writes new updates as the
documents `heal()` exchanges arrive, and the network can drop those too. The run healed once,
so a dropped update stayed lost and the run failed with a `ConvergenceError`. It now heals and
settles again until a round drops nothing, at most 10 rounds, as a provider that resyncs would.
The steps make the same random choices, so a seed replays the same steps. When the tenth round
still dropped updates and the peers did not converge, the error says so. `expectConverged()`
now also says how many updates were dropped since the last `heal()`, so tests that heal by hand
get the same hint: repeat `heal()` and `settle()` until `stats().dropped` stops growing.
