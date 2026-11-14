import { applyChanges, type ApplyOps } from "./apply.js";
import type { TextPolicy } from "./diff.js";
import type { CrdtBackend, JsonObject, Unsubscribe } from "./types.js";

/**
 * What a CRDT library supplies for `createCrdtBackend`: how to read its document, change it in
 * one transaction, and hear of its changes, and which strings it stores as text.
 * `createCrdtBackend` turns them into a `CrdtBackend`.
 */
export interface CrdtBackendParts {
  /**
   * The synced subtree as a JSON snapshot that never aliases the document, as
   * `CrdtBackend.read` returns it; the backend's `read` is this function.
   */
  read: () => JsonObject;
  /**
   * Runs `edit` as one transaction tagged as this backend's own, handing it the synced root and
   * the `ApplyOps` that write into it, built for `text`. When the document holds no map there,
   * `transact` puts an empty one in its place and passes `created`, so the write diffs against
   * `{}` instead of reading the document.
   */
  transact: (
    edit: (root: object, ops: ApplyOps, created?: boolean) => void,
  ) => void;
  /**
   * Calls `onChange` after every change to the synced subtree, with `own` set when the change
   * carries this backend's tag, as `transact` gives it.
   */
  watch: (onChange: (own: boolean) => void) => Unsubscribe;
  /**
   * `CrdtBackend.revision`, which the backend passes on unchanged; return `undefined` when the
   * library cannot tell.
   */
  revision: () => unknown;
  /**
   * Which strings the library stores as its text type, by their path from the synced root; a
   * write edits those in place and replaces every other changed string whole. Defaults to none.
   * Give the `ApplyOps` that `transact` hands over the same policy.
   */
  text?: TextPolicy;
}

/**
 * Builds a `CrdtBackend` from what varies by CRDT library. The backend:
 *
 * - writes `next` in one `transact`, with `applyChanges`, `json: true` and the parts' `text`. It
 *   applies only what differs from `{}` when `transact` created the root, otherwise from
 *   `previous` when the engine gives it, and otherwise from `read()`;
 * - reports through `subscribe` only the changes that `watch` does not mark as its own;
 * - reads with `read`, and has the parts' `revision`.
 *
 * @example
 * ```typescript
 * const ops = createLoroOps(options.text);
 * return createCrdtBackend({
 *   read: () => map.toJSON(),
 *   transact: (edit) => {
 *     edit(map, ops);
 *     doc.commit({ origin });
 *   },
 *   watch: (onChange) => map.subscribe((event) => onChange(event.origin === origin)),
 *   revision: () => doc.opCount(),
 *   text: options.text,
 * });
 * ```
 */
export const createCrdtBackend = ({
  read,
  transact,
  watch,
  revision,
  text,
}: CrdtBackendParts): CrdtBackend => {
  const diff = { text, json: true };

  return {
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

    revision,

    subscribe: (onRemoteChange) =>
      watch((own) => {
        if (!own) onRemoteChange();
      }),
  };
};
