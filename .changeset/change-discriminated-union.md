---
"@homeostate/core": minor
---

Breaking: `Change` is a discriminated union of objects instead of a `[type, key, value]` tuple,
and `ChangeType` is a const object instead of an `enum`. A script holds one kind of step:
`RecordChange` for a record, keyed by property name, and `ListChange` or `TextChange` for an
array or a string, keyed by position. `getChanges` returns the script of the kind of the values
it diffs, or an `EditScript` for values typed only as `Diffable`, and `applyStringChanges` takes
a `TextChange[]`. Narrowing a step by `type`, and a pending step by `kind`, replaces the casts.

Adjacent array items or characters deleted together are now one `delete` step with a `count`,
which `applyChanges` passes to `splice` or `editText` as one call. Clearing a 5000-item list or a
5000-character text through the Yjs backend takes one `delete` instead of 5000, and about 1 ms
instead of 100 to 250 ms.

To migrate code that reads or builds changes:

- Destructure properties instead of the tuple: `const { type, key } = change`. An insert or
  update carries `value`; a pending step carries `kind` (`"record"`, `"list"` or `"text"`) and
  its nested `changes`, which used to be its third entry.
- Apply an array or string delete's `count`, treating an absent one as `1`. A string delete's
  length used to be its third entry. `getChanges` sets it on every array and string delete.
- `ChangeType.INSERT` and the other members keep their values, and `ChangeType` is still the
  type of the four strings. Code that relied on the `enum` type, rather than its values, now
  takes the string literals.
- Annotate scripts as `RecordChange[]`, `ListChange[]`, `TextChange[]` or `EditScript` instead of
  `Change[]`, which is a single step of any kind.

`ApplyOps` is unchanged, so backends and stores that apply changes through `applyChanges` need
no change.
