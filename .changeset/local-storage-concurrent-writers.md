---
"@homeostate/persist-local-storage": minor
---

Keep tabs that persist the same key from overwriting each other's updates. Each append,
compaction and clear read the whole entry and wrote it back, so two tabs writing at once could
replace each other's log and lose an update or a compaction's snapshot. They now hold a Web Lock
named `@homeostate/persist-local-storage:<prefix><key>` while they read and rewrite the entry,
so writers of one key take turns, and different keys and prefixes stay independent. `load` takes
no lock.

Behaviour change: without the Web Locks API (`navigator.locks`), `append`, `compact` and
`clear` now reject with an error that says so, and `createPersistence` reports it through
`onError` and its barriers. Browsers provide Web Locks in secure contexts only: https and
localhost. A page opened over plain http from another address, such as a LAN IP, needs https,
or the new `coordination: "single-writer"` option, which writes without a lock as before and is
safe only while one tab writes the storage, as with `sessionStorage`. Tests running in jsdom,
which has no `navigator.locks`, need the option or a stubbed `navigator.locks`.
