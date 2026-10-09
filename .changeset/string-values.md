---
"@homeostate/core": minor
"@homeostate/crdt-yjs": minor
"@homeostate/crdt-loro": minor
"@homeostate/crdt-automerge": minor
---

Store strings as plain values unless a `text` option marks them as collaborative text. Every
backend stored every string as its text type and merged concurrent replacements character by
character, so two peers setting a filter to `"active"` and `"completed"` at once converged to
`"compctiveeted"`; ids and timestamps merged the same way. Concurrent writes of a string now
keep one of the written values.

Mark prose that should keep merging with the backend's new `text` option, which receives each
string's path from the synced root:

```ts
createYjsBackend(doc, "shared", {
  text: (path) => path[0] === "todos" && path[2] === "title",
});
```

Yjs and Loro store other strings as plain map and list values, and Automerge as
`ImmutableString`. `read()` returns plain strings for both kinds. Documents written by earlier
releases hold every string as text: they read as before, and each string is stored as the
configured kind the next time it changes. Give every backend writing to a document the same
policy.

Core adds `getChanges(a, b, { text })`, which replaces strings outside the policy with one
`UPDATE`; without the option every string is still diffed character by character. It also
exports the `TextPolicy` and `DiffOptions` types, and exports `applyStringChanges` again for
backends that find text stored as a plain value.
