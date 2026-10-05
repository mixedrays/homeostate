---
description: getChanges, Change and ChangeType, ordered array and UTF-16 string edits, text policies, toJsonValue, and applying changes in place with ApplyOps.
label: Diff and apply API
order: 3
---

# Diff and apply API

Import these APIs and types from `@homeostate/core`. They let adapters and backends translate
JSON snapshots into small edits while preserving existing containers where possible.

## getChanges

```ts
type Diffable = Record<string, unknown> | Array<unknown> | string;
type TextPolicy = (path: readonly (string | number)[]) => boolean;

interface DiffOptions {
  text?: TextPolicy;
  json?: boolean;
}

declare const getChanges: (
  a: Diffable,
  b: Diffable,
  options?: DiffOptions,
) => Change[];
```

Returns an ordered edit script that transforms `a` into `b`, without mutating either input.

| Parameter      | Description                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `a`            | The current plain record, array or string.                                                                         |
| `b`            | The desired value, with the same root kind as `a`.                                                                 |
| `options.text` | Which nested strings are diffed character by character; see [Text policy](#text-policy). Defaults to every string. |
| `options.json` | Diff `b` as `JSON.stringify` would store it; see [toJsonValue](#tojsonvalue). Defaults to `false`.                 |

Equal values produce `[]`. Different root kinds also produce `[]`: this API cannot express
replacement of the root. Wrap a value in a record if its type may change, or handle root
replacement in your adapter. Nested values that change kind produce an `UPDATE`.

Use plain JSON data. `Date`, `Map` and `Set` contents are not compared, and cyclic data is
unsupported. Unless `options.json` is set, this helper does not filter functions for you. Record
keys are compared as own properties, and a `__proto__` key is ignored on both sides.

```ts title="get-changes-example.ts"
import { getChanges } from "@homeostate/core";

console.log(getChanges({ count: 1 }, { count: 2 }));
// [["update", "count", 2]]

console.log(getChanges([1, 2, 3], [1, 3]));
// [["delete", 1, undefined]]

console.log(getChanges({ value: [1] }, { value: "one" }));
// [["update", "value", "one"]]

console.log(getChanges([1], "one"));
// []: root replacement is not represented
```

## Change and ChangeType

```ts
enum ChangeType {
  INSERT = "insert",
  UPDATE = "update",
  DELETE = "delete",
  PENDING = "pending",
}

type Change = [ChangeType, string | number, unknown];
```

Each tuple is `[type, key, value]`. A record key is a string; array and string positions
are numbers.

| Type      | Meaning                                                                   | Third entry                                                                                             |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `INSERT`  | Adds a record key, array item or run of text.                             | The inserted value or string.                                                                           |
| `UPDATE`  | Replaces an existing record property or array item.                       | The replacement value.                                                                                  |
| `DELETE`  | Removes a record key, one array item or part of a string.                 | `undefined` for records and arrays; a UTF-16 deletion length for strings, with `undefined` meaning `1`. |
| `PENDING` | Applies a nested script to the existing object, array or string at `key`. | A `Change[]`, not a replacement value.                                                                  |

`PENDING` already contains the nested changes; it does not ask the consumer to compute
another diff. Inserted and replacement values may refer to objects in `b`; clone or convert
them in your operations when your store needs ownership of those values.

### Array positions

Apply steps in their original order. Each index refers to the array after all preceding
steps, so deleting several adjacent items can repeat an index. Do not reorder or clamp the
indices. Array matching compares values structurally; it does not use an `id` field as an
identity key.

### String offsets

Offsets and deletion lengths use UTF-16 code units, as JavaScript indexes strings. Generated
edits preserve code point boundaries, so a supplementary character is deleted in one step
of length `2`. Combining marks and joined emoji can still span several edits: these are not
grapheme-based operations.

```ts title="string-changes-example.ts"
import { getChanges } from "@homeostate/core";

console.log(getChanges("😀a😃b", "😀ab"));
// [["delete", 3, 2]]: remove the whole 😃 surrogate pair

console.log(getChanges("a", "abc"));
// [["insert", 1, "bc"]]: insert a run of text in one step
```

As with arrays, offsets address the progressively edited string. Backends whose native
text indexes are not UTF-16 must translate both offsets and lengths. String scripts use
insertions and deletions; replacements are expressed as a combination of those steps.

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
// [["update", "status", "done"], ["pending", "title", [["insert", 4, " it"]]]]

console.log(getChanges(before, after));
// Without a policy, "status" is edited character by character too.
```

## applyStringChanges

```ts
declare const applyStringChanges: (value: string, changes: Change[]) => string;
```

Returns `value` revised by a string edit script: what `getChanges` returns for two strings,
or the script of a `PENDING` step on a string. Steps other than `INSERT` and `DELETE` are
ignored.

A backend needs it when a `PENDING` step reaches a string the document holds as a plain value
rather than as text, for example one written by a peer with another policy. It stores the
edited string as text instead.

```ts title="apply-string-changes-example.ts"
import { applyStringChanges, getChanges } from "@homeostate/core";

console.log(applyStringChanges("Plan", getChanges("Plan", "Plan it")));
// "Plan it"
```

## toJsonValue

```ts
declare const toJsonValue: (value: unknown) => unknown;
```

Returns `value` as `JSON.stringify` would store it. Object entries holding `undefined` or a
function are left out, and such array items, holes included, become `null`. Own `__proto__`
keys are left out too. The input is never mutated: only the containers on a path to a removed
or replaced value are copied, and a value that is already JSON is returned as is.

`getChanges` with `json: true` applies the same rule as it diffs: entries holding `undefined`
or a function count as absent, such array items and holes compare equal to `null`, and only
the values its changes carry go through `toJsonValue`. A backend sets it on `write(next)`. CRDT
libraries reject `undefined` or functions, often after applying the operations before them, so
diffing by the rule means a write applies in full. It also keeps rewrites idle: the document
holds `null` where the store holds an `undefined` array item, and a plain diff against the raw
value would replace that item on every write. Calling `toJsonValue` on the whole state first
gives the same changes, but copies the state on every write.

```ts title="to-json-value-example.ts"
import { toJsonValue } from "@homeostate/core";

console.log(toJsonValue({ a: undefined, list: [1, undefined], fn: () => 1 }));
// { list: [1, null] }
```

## applyChanges

```ts
declare const applyChanges: (
  target: object,
  changes: Change[],
  ops: ApplyOps,
) => void;
```

Mutates a record or array in place through `ops` and returns `void`. Only paths named by
the script are written; untouched containers keep their identity. There are no default
operations: provide all three `ApplyOps` methods.

| Parameter | Description                                                                     |
| --------- | ------------------------------------------------------------------------------- |
| `target`  | A mutable record or array matching the state used as `a` in `getChanges(a, b)`. |
| `changes` | The ordered edit script returned by `getChanges`.                               |
| `ops`     | How to set properties, remove keys and splice arrays in your store.             |

Nested strings are rebuilt and assigned through `ops.set`. A root string is not accepted;
wrap it in a record or interpret its string script in your backend.

Keep `target` aligned with the diff's starting state. A nested `PENDING` step whose target
is no longer a container or string is left unapplied; the function cannot recover the
desired replacement from that step. It does not validate or rebase stale edit scripts.

Operations run synchronously. If an operation throws, the error propagates and prior
mutations remain; wrap the call in your store's transaction when atomicity is needed.

### Example

These operations use ordinary JavaScript mutations. An observable store can provide its
own operations with the same signatures:

```ts title="apply-changes-example.ts"
import { applyChanges, getChanges, type ApplyOps } from "@homeostate/core";

const ops: ApplyOps = {
  set: (target, key, value) => {
    (target as Record<string | number, unknown>)[key] = value;
  },
  remove: (target, key) => {
    delete (target as Record<string, unknown>)[key];
  },
  splice: (target, index, deleteCount, inserted) => {
    target.splice(index, deleteCount, ...inserted);
  },
};

const target = { todos: [{ title: "Read docs", done: false }], count: 0 };
const next = { todos: [{ title: "Read docs", done: true }], count: 1 };
const originalTodo = target.todos[0];
const changes = getChanges(target, next);

applyChanges(target, changes, ops);

console.log(target.todos[0].done, target.count); // true, 1
console.log(target.todos[0] === originalTodo); // true: updated in place
```

## ApplyOps

```ts
interface ApplyOps {
  set(target: object, key: string | number, value: unknown): void;
  remove(target: object, key: string): void;
  splice(
    target: unknown[],
    index: number,
    deleteCount: number,
    inserted: unknown[],
  ): void;
}
```

| Method   | Contract                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `set`    | Assigns a record property or array item. Also creates newly inserted record properties and replaces edited string fields. |
| `remove` | Deletes a record property. Array deletions go through `splice`.                                                           |
| `splice` | Removes `deleteCount` items at `index`, then inserts the values in `inserted`, like `Array.prototype.splice`.             |

Every target passed to an operation is a container already in the store. The walker does
not clone it. For `PENDING`, it descends into that existing container instead of replacing
it. If your store requires batched notifications, apply the entire script within one batch.

Source: [diff.ts](../src/diff.ts), [change.ts](../src/change.ts), [json.ts](../src/json.ts) and
[apply.ts](../src/apply.ts).
