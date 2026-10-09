---
"@homeostate/store-zustand": patch
---

Fix the JSDoc examples shown in editor tooltips. The `homeostate` example now uses the curried
`create<T>()(...)` form, since `create(homeostate(...))` types the state as `object`, and the
`createZustandAdapter` example lists its imports.
