---
"@homeostate/crdt-automerge": patch
---

A listener of `createAutomergeHandle` that throws no longer stops the listeners after it from
hearing a change. Every listener is called, as Yjs calls every observer, then `change` or
`update` throws the first error. Before, a store whose `setState` threw kept a replication listener
subscribed after the engine from ever sending the change, although the document held it.
