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
 * Gives `doc` the starting text as one update authored by a fixed client id, before it syncs.
 *
 * Every tab applies the very same update, so every tab holds the very same Y.Text, and a tab
 * joining a room that already has it adds nothing. If each tab seeded its own text instead,
 * the room would end up with two Y.Texts set on one key; Yjs keeps whichever client id sorts
 * last and drops the other along with every edit made to it, so about half the time a new
 * tab would reset the document.
 *
 * Changing INITIAL_TEXT while a sync server still holds the room gives the same ids different
 * content, and tabs on either version stop agreeing; restart the server after editing it.
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
