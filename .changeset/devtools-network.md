---
"@homeostate/tool-devtools": minor
---

Add network conditions. `createNetworkLink` in `@homeostate/tool-devtools/network` puts a link between the app's document and the one its provider syncs, relaying their binary updates; pass it as a source's `network`. The new Network tab takes the link offline, adds latency and jitter, or makes it flaky, and counts the updates on their way. Coming back online exchanges the whole documents, so both sides merge what the other missed.
