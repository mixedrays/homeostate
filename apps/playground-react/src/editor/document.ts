import * as Y from "yjs";
import type { TextPolicy } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { SYNC_MAP_NAME } from "../sync";

export const INITIAL_TEXT = `Welcome to the shared document.

Open this page in a second tab and type in both. Each tab is a separate writer: give yourself a name above, or stay anonymous, and watch the other tab's cursor move as it types.

Try "Go offline", edit both tabs, then go back online. The text lives in a Zustand store as one plain string, and homeostate syncs it into a Y.Text character by character, so the two versions merge instead of one overwriting the other.`;

/**
 * The document's `text` is a Y.Text, so what several tabs type at once merges. Every backend
 * on the editor's room must pass it.
 */
export const isDocumentText: TextPolicy = (path) =>
  path.length === 1 && path[0] === "text";

/**
 * Seeds `doc` with one fixed-client update, so every tab holds the same Y.Text; separate seeds
 * would compete for the key and reset the document about one join in two. Restart the sync
 * server after changing INITIAL_TEXT.
 */
export function seedDocument(doc: Y.Doc): void {
  const seed = new Y.Doc();
  seed.clientID = 0;
  createYjsBackend(seed, SYNC_MAP_NAME, { text: isDocumentText }).write({
    text: INITIAL_TEXT,
  });
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
}

/**
 * The Y.Text homeostate keeps the store's `text` in. It is the one from `seedDocument`: the
 * engine only ever edits a Y.Text in place, so nothing replaces it afterwards.
 */
export function sharedText(doc: Y.Doc): Y.Text {
  return doc.getMap(SYNC_MAP_NAME).get("text") as Y.Text;
}
