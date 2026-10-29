import { applyChanges, type ApplyOps } from "./apply.js";
import type { TextPolicy } from "./diff.js";
import type { CrdtBackend, JsonObject, Unsubscribe } from "./types.js";

/**
 * What a CRDT library supplies for `createCrdtBackend`, built for one text policy: how to read
 * its document, change it in one transaction, and hear of its changes. `createCrdtBackend`
 * turns them into a `CrdtBackend`.
 */
export interface CrdtBackendParts {
  /**
   * The synced subtree as a JSON snapshot that never aliases the document, as
   * `CrdtBackend.read` returns it; the backend's `read` is this function.
   */
  read: () => JsonObject;
  /**
   * Runs `edit` as one transaction tagged as this backend's own, handing it the synced root and
   * the `ApplyOps` that write into it. When the document holds no map there, `transact` puts an
   * empty one in its place and passes `created`, so the write diffs against `{}` instead of
   * reading the document.
   */
  transact: (
    edit: (root: object, ops: ApplyOps, created?: boolean) => void,
  ) => void;
  /**
   * Calls `onChange` after every change to the synced subtree, with `own` set when the change
   * carries this backend's tag, as `transact` gives it. Returns the cleanup.
   */
  watch: (onChange: (own: boolean) => void) => Unsubscribe;
  /** `CrdtBackend.revision`, which the backend gets as it is; leave it out when there is none. */
  revision?: () => unknown;
}

/** Options for `createCrdtBackend` */
export interface CrdtBackendOptions {
  /**
   * Which strings are stored as the library's text type, by their path from the synced root.
   * Defaults to none: every string is a plain value.
   */
  text?: TextPolicy;
}

const noText: TextPolicy = () => false;

/**
 * Builds a `CrdtBackend` from what varies by CRDT library. `build` gets the text policy, with the
 * default applied, and returns the parts; it is called once. The backend then:
 *
 * - writes `next` in one `transact`, applying only what differs from `previous` when the engine
 *   gives it, from `{}` when `transact` created the root, and otherwise from `read()`, with
 *   `applyChanges` and `json: true`;
 * - reports through `subscribe` only the changes `watch` does not call its own;
 * - reads with `read`, and has `revision` when the parts do.
 *
 * @example
 * ```typescript
 * return createCrdtBackend((text) => {
 *   const ops = createLoroOps(text);
 *   return {
 *     read: () => map.toJSON(),
 *     transact: (edit) => {
 *       edit(map, ops);
 *       doc.commit({ origin });
 *     },
 *     watch: (onChange) => map.subscribe((event) => onChange(event.origin === origin)),
 *     revision: () => doc.opCount(),
 *   };
 * }, options);
 * ```
 */
export const createCrdtBackend = (
  build: (text: TextPolicy) => CrdtBackendParts,
  options: CrdtBackendOptions = {},
): CrdtBackend => {
  const text = options.text ?? noText;
  const { read, transact, watch, revision } = build(text);
  const diff = { text, json: true };

  const backend: CrdtBackend = {
    read,

    write: (next, previous) =>
      transact((root, ops, created) =>
        applyChanges(
          root,
          created ? {} : (previous ?? read()),
          next,
          ops,
          diff,
        ),
      ),

    subscribe: (onRemoteChange) =>
      watch((own) => {
        if (!own) onRemoteChange();
      }),
  };
  if (revision !== undefined) backend.revision = revision;
  return backend;
};
