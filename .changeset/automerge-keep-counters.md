---
"@homeostate/crdt-automerge": patch
---

A write that changes the value of a `Counter` other Automerge code stored now increments it by
the difference instead of replacing it with a plain number, so that code's concurrent increments
are kept and the key stays a `Counter`. A write still replaces the counter when the value isn't
an integer, is an integer from `Number.MAX_SAFE_INTEGER` up or from its negation down, differs
from the counter's value by more than that, or when the counter already holds such an integer. A
`Counter` at a key of a losing synced map now moves into the winner as a `Counter`. A `Counter`
at the synced key itself is now replaced by the synced map on the next write, like any other
plain value, instead of making that write throw a `TypeError`.
