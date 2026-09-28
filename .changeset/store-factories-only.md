---
"@homeostate/store-jotai": minor
"@homeostate/store-mobx": minor
"@homeostate/store-mobx-state-tree": minor
"@homeostate/store-redux": minor
"@homeostate/store-tanstack": minor
"@homeostate/store-valtio": minor
"@homeostate/store-zustand": minor
---

Stop exporting the adapter classes (`JotaiAdapter`, `MobxAdapter`, `MobxStateTreeAdapter`, `ReduxAdapter`, `TanStackStoreAdapter`, `ValtioAdapter`, `ZustandAdapter`); create adapters with the `create*Adapter` factories, which now carry the adapter docs and examples.
