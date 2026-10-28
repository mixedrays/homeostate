---
description: getChanges, Change and ChangeType, ordered array and UTF-16 string edits, text policies, toJsonValue, and applying changes in place with ApplyOps.
label: Diff and apply API
order: 3
---

# Diff and apply API

Import these APIs and types from `@homeostate/core`. Backends and store adapters use them to
turn a JSON snapshot into small edits that keep unchanged containers in place.

## getChanges

```ts
type Diffable = Record<string, unknown> | Array<unknown> | string;
type TextPolicy = (path: readonly (string | number)[]) => boolean;

interface DiffOptions {
  text?: TextPolicy;
  json?: boolean;
}

declare function getChanges(
  a: string,
  b: string,
  options?: DiffOptions,
): TextChange[];
declare function getChanges(
  a: unknown[],
  b: unknown[],
  options?: DiffOptions,
): ListChange[];
declare function getChanges(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  options?: DiffOptions,
): RecordChange[];
declare function getChanges(
  a: Diffable,
  b: Diffable,
  options?: DiffOptions,
): EditScript;
```

Returns an ordered edit script that transforms `a` into `b`, without mutating either input. Two
values of one kind return the script of that kind; values typed only as `Diffable` return an
`EditScript`.

| Parameter      | Description                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `a`            | The current plain record, array or string.                                                                         |
| `b`            | The desired value, with the same root kind as `a`.                                                                 |
| `options.text` | Which nested strings are diffed character by character; see [Text policy](#text-policy). Defaults to every string. |
| `options.json` | Diff `a` and `b` as `JSON.stringify` would store them; see [toJsonValue](#tojsonvalue). Defaults to `false`.       |

Equal values produce `[]`, and so do different root kinds, since an edit script cannot
replace its root. Nested values that change kind produce an `UPDATE`.

Records and arrays shared by identity are skipped without visiting their contents, including
their text-policy paths. Update containers immutably to retain this shortcut: copy each
container along a changed path and reuse the rest. A changed record still compares its own
keys, and a changed array still matches items by value.

Use plain JSON data: `Date`, `Map` and `Set` contents are not compared, and cyclic data is
unsupported. Record keys are compared as own properties, and a `__proto__` key is ignored on
both sides.

```ts title="get-changes-example.ts"
import { getChanges } from "@homeostate/core";

console.log(getChanges({ count: 1 }, { count: 2 }));
// [{ type: "update", key: "count", value: 2 }]

console.log(getChanges([1, 2, 3], [1, 3]));
// [{ type: "delete", key: 1, count: 1 }]

console.log(getChanges({ value: [1] }, { value: "one" }));
// [{ type: "update", key: "value", value: "one" }]

console.log(getChanges([1], "one"));
// []: root replacement is not represented
```

## Change and ChangeType

```ts
const ChangeType = {
  INSERT: "insert",
  UPDATE: "update",
  DELETE: "delete",
  PENDING: "pending",
} as const;
type ChangeType = (typeof ChangeType)[keyof typeof ChangeType];

type ContainerKind = "record" | "list" | "text";

type RecordChange =
  | { type: "insert" | "update"; key: string; value: unknown }
  | { type: "delete"; key: string; count?: never }
  | PendingChange<string>;

type ListChange =
  | { type: "insert" | "update"; key: number; value: unknown }
  | { type: "delete"; key: number; count?: number }
  | PendingChange<number>;

type TextChange =
  | { type: "insert"; key: number; value: string }
  | { type: "delete"; key: number; count?: number };

// Not exported: a pending step names the kind of its nested script.
type PendingChange<K> =
  | { type: "pending"; key: K; kind: "record"; changes: RecordChange[] }
  | { type: "pending"; key: K; kind: "list"; changes: ListChange[] }
  | { type: "pending"; key: K; kind: "text"; changes: TextChange[] };

type Change = RecordChange | ListChange | TextChange;
type EditScript = RecordChange[] | ListChange[] | TextChange[];
```

A script holds the steps of one kind of container: `RecordChange`s for a record, keyed by
property name, and `ListChange`s or `TextChange`s for an array or a string, keyed by position.
Narrow a step by `type`, and a pending step's nested script by `kind`; the payload then needs no
cast.

| Type      | Meaning                                                                   | Payload                                                                                      |
| --------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `INSERT`  | Adds a record key, array item or run of text.                             | `value`: the inserted value, or a string of one or more characters.                          |
| `UPDATE`  | Replaces an existing record property or array item.                       | `value`: the replacement value.                                                              |
| `DELETE`  | Removes a record key, a run of array items or part of a string.           | `count`: how many items or UTF-16 units, on every array and string delete; none for records. |
| `PENDING` | Applies a nested script to the existing object, array or string at `key`. | `kind`: the container the script edits; `changes`: its script.                               |

`getChanges` sets `count` on every array and string delete, `1` included. An applier treats an
absent `count` as `1`, so a script written by hand may leave it out.

Inserted and replacement values may be objects from `b`; clone or convert them when your
store needs to own them.

### Array positions

Apply steps in order: each index refers to the array after all preceding steps. Adjacent items
deleted together are one step with their `count`, so clearing a list is one splice. Items are
matched by value, not by an `id` field.

### String offsets

Offsets and counts use UTF-16 code units, as JavaScript indexes strings. Adjacent characters
deleted together are one step, and generated edits preserve code point boundaries, so a
supplementary character is always deleted whole, as part of one step. Combining marks and
joined emoji can still span several edits: these are not grapheme-based operations.

```ts title="string-changes-example.ts"
import { getChanges } from "@homeostate/core";

console.log(getChanges("😀a😃b", "😀ab"));
// [{ type: "delete", key: 3, count: 2 }]: remove the whole 😃 surrogate pair

console.log(getChanges("hello world", "hello"));
// [{ type: "delete", key: 5, count: 6 }]: delete a run of text in one step

console.log(getChanges("a", "abc"));
// [{ type: "insert", key: 1, value: "bc" }]: insert a run of text in one step
```

As with arrays, each offset addresses the string as edited so far. String scripts hold only
inserts and deletes. Backends whose text indexes are not UTF-16 must translate offsets and
counts.

### Text policy

A `TextPolicy` receives the path of a nested string from the root of `a`: record keys and
array indices, such as `["todos", 0, "title"]`. An index is the item's position in `b`. A
string at a path where it returns `true` is diffed character by character. Any other changed
string is replaced whole by one `UPDATE`. Two strings passed directly to `getChanges` are
always diffed character by character.

The supplied backends pass their `text` option here, so a string outside it reaches the CRDT
as one value, and concurrent writes keep one of them instead of merging their characters.

```ts title="text-policy-example.ts"
import { getChanges, type TextPolicy } from "@homeostate/core";

const isTitle: TextPolicy = (path) => path[path.length - 1] === "title";
const before = { status: "all", title: "Plan" };
const after = { status: "done", title: "Plan it" };

console.log(getChanges(before, after, { text: isTitle }));
// [
//   { type: "update", key: "status", value: "done" },
//   {
//     type: "pending",
//     key: "title",
//     kind: "text",
//     changes: [{ type: "insert", key: 4, value: " it" }],
//   },
// ]

console.log(getChanges(before, after));
// Without a policy, "status" is edited character by character too.
```

## applyStringChanges

```ts
declare const applyStringChanges: (
  value: string,
  changes: TextChange[],
) => string;
```

Returns `value` revised by a string edit script: what `getChanges` returns for two strings,
or the script of a `PENDING` step whose `kind` is `"text"`.

```ts title="apply-string-changes-example.ts"
import { applyStringChanges, getChanges } from "@homeostate/core";

console.log(applyStringChanges("Plan", getChanges("Plan", "Plan it")));
// "Plan it"
```

## toJsonValue

```ts
declare const toJsonValue: (value: unknown) => unknown;
```

Returns `value` as `JSON.stringify` would store it: object entries holding `undefined` or a
function are left out, such array items, holes included, become `null`, so do `NaN` and
infinite numbers, and own `__proto__` keys are dropped. Only the containers on a path to a changed value are copied, and a value
that is already JSON is returned as is.

`getChanges` with `json: true` applies the same rule to both sides as it diffs, and passes only
the values its changes carry through `toJsonValue`. CRDT libraries reject `undefined` and
functions, so a backend sets it on `write(next, previous)`. Without it, an `undefined` array
item the document holds as `null` would be rewritten on every write, and diffing against
`previous` could delete entries the document never held.

```ts title="to-json-value-example.ts"
import { toJsonValue } from "@homeostate/core";

console.log(toJsonValue({ a: undefined, list: [1, undefined], fn: () => 1 }));
// { list: [1, null] }
```

## applyChanges

```ts
declare const applyChanges: (
  target: object,
  current: object,
  next: object,
  ops: ApplyOps,
  options?: DiffOptions,
) => void;
```

Makes `target` equal to `next` in place. It diffs `current` against `next` with `getChanges`
and walks the edit script through `ops`, so only the paths that differ are written and
untouched containers keep their identity.

| Parameter | Description                                                                             |
| --------- | --------------------------------------------------------------------------------------- |
| `target`  | The record or list to mutate: a store's container or a document's root map.             |
| `current` | What `target` holds now, as JSON, such as a store's snapshot or a backend's `previous`. |
| `next`    | What `target` should hold.                                                              |
| `ops`     | How to read and write your containers; see [ApplyOps](#applyops).                       |
| `options` | Passed to `getChanges`. A CRDT backend passes its `text` policy and `json: true`.       |

A `PENDING` step edits the child in place when `ops.kind` reports the step's `kind`: a record
for a record, a list for an array, and text for a string. Any other
child, such as a string held as a plain value or text written under another text policy, is
replaced whole with its next value through `ops.set`, passed through
[toJsonValue](#tojsonvalue) with `options.json`.

Nothing is written when `ops.kind(target)` is not a record or a list, or when `current` and
`next` are not both of that kind. Operations run synchronously after the whole diff is
computed; if one throws, earlier mutations remain, so wrap the call in a transaction when it
must be atomic.

### Example

These operations use ordinary JavaScript mutations. Strings are plain values here, so `kind`
never returns `"text"` and `editText` is omitted:

```ts title="apply-changes-example.ts"
import { applyChanges, type ApplyOps } from "@homeostate/core";

type Container = Record<string | number, unknown>;

const ops: ApplyOps = {
  kind: (value) =>
    Array.isArray(value)
      ? "list"
      : value !== null && typeof value === "object"
        ? "record"
        : undefined,
  get: (container, key) => (container as Container)[key],
  set: (container, key, value) => {
    (container as Container)[key] = value;
  },
  remove: (container, key) => {
    delete (container as Container)[key];
  },
  splice: (list, index, deleteCount, inserted) => {
    (list as unknown[]).splice(index, deleteCount, ...inserted);
  },
};

const target = { todos: [{ title: "Read docs", done: false }], count: 0 };
const next = { todos: [{ title: "Read docs", done: true }], count: 1 };
const originalTodo = target.todos[0];

applyChanges(target, structuredClone(target), next, ops);

console.log(target.todos[0].done, target.count); // true, 1
console.log(target.todos[0] === originalTodo); // true: updated in place
```

## ApplyOps

```ts
type ContainerKind = "record" | "list" | "text";
type Path = readonly (string | number)[];

interface ApplyOps {
  kind(value: unknown): ContainerKind | undefined;
  get(container: object, key: string | number): unknown;
  set(
    container: object,
    key: string | number,
    value: unknown,
    path: Path,
  ): void;
  remove(container: object, key: string, path: Path): void;
  splice(
    list: object,
    index: number,
    deleteCount: number,
    inserted: unknown[],
    path: Path,
  ): void;
  editText?(
    text: unknown,
    index: number,
    deleteCount: number,
    inserted: string,
    path: Path,
  ): void;
}
```

| Method     | Contract                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `kind`     | Classifies the target or a child read with `get`: a container to edit in place, or `undefined` for a plain value to replace whole. |
| `get`      | Returns the child at `key` of a record or list.                                                                                    |
| `set`      | Assigns a record property or list item, creating a new record property. Also receives every replaced child.                        |
| `remove`   | Deletes a record property. List deletions go through `splice`.                                                                     |
| `splice`   | Removes `deleteCount` items at `index`, then inserts the values in `inserted`, like `Array.prototype.splice`.                      |
| `editText` | Deletes `deleteCount` UTF-16 units at `index` of a text, then inserts `inserted`. Omit it for a store without text.                |

A run of deleted items reaches `splice`, and a run of deleted characters `editText`, as one
call with its count, so a backend deletes it in one library operation.

`path` is the path of the container an operation acts on, from `target`; for `editText` it is
the text's own path. A backend uses it to convert each value it writes, for example to store
the strings its text policy marks as text: the value `set` writes sits at `[...path, key]`, and
the `i`th value `splice` inserts at `[...path, index + i]`. Automerge, which edits text by path
rather than through a text object, uses it in `editText`.

Every container passed to an operation is already in the target, and values are never
cloned: convert or copy them in `set` and `splice` when your store needs to own them. If your
store batches notifications, run the whole call in one batch.

Source: [diff.ts](../src/diff.ts), [change.ts](../src/change.ts), [json.ts](../src/json.ts) and
[apply.ts](../src/apply.ts).
