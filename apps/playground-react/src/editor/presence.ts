import * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";

/**
 * Who is in the document and where their cursor is. None of this is document state, so it
 * travels over Yjs awareness rather than through the store: it belongs to one tab, and it
 * disappears when the tab closes or goes offline.
 */

export type Awareness = WebsocketProvider["awareness"];

/** A selection in the text; `anchor` is where it started, `head` where the caret is. */
export interface Selection {
  anchor: number;
  head: number;
}

/** A textarea's selection, anchored on the side the user started selecting from. */
export const readSelection = (el: HTMLTextAreaElement): Selection =>
  el.selectionDirection === "backward"
    ? { anchor: el.selectionEnd, head: el.selectionStart }
    : { anchor: el.selectionStart, head: el.selectionEnd };

export interface User {
  name: string;
  color: string;
  /** True while the user has not typed a name and goes by the generated one. */
  anonymous: boolean;
}

export interface Peer extends User {
  clientId: number;
  isLocal: boolean;
  /**
   * The selection as Yjs relative positions, pinned to characters rather than offsets, so it
   * stays on the same text while others type before it. Null while the editor is not focused.
   */
  cursor: { anchor: unknown; head: unknown } | null;
}

/** Cursor colours dark enough to carry a white name label. */
const COLORS = [
  "#2563eb",
  "#dc2626",
  "#15803d",
  "#9333ea",
  "#c2410c",
  "#0e7490",
  "#db2777",
  "#4f46e5",
  "#0f766e",
  "#a21caf",
  "#b45309",
  "#0369a1",
];

const ANIMALS = [
  "Otter",
  "Fox",
  "Panda",
  "Koala",
  "Heron",
  "Lynx",
  "Badger",
  "Falcon",
  "Owl",
  "Hedgehog",
  "Beaver",
  "Walrus",
  "Moose",
  "Penguin",
  "Raccoon",
  "Capybara",
];

const pick = <T>(list: readonly T[]): T =>
  list[Math.floor(Math.random() * list.length)];

export interface Identity {
  color: string;
  anonymousName: string;
}

/**
 * A colour and a fallback name for this tab. Both are drawn per page load rather than stored,
 * since a duplicated tab copies its session storage and would come up as the same person.
 */
export const createIdentity = (): Identity => ({
  color: pick(COLORS),
  anonymousName: `Anonymous ${pick(ANIMALS)}`,
});

export const toUser = (identity: Identity, name: string): User => {
  const trimmed = name.trim();
  return {
    name: trimmed || identity.anonymousName,
    color: identity.color,
    anonymous: trimmed === "",
  };
};

const NAME_KEY = "homeostate-editor:name";

/** The name typed in this tab, kept per tab so a reload does not lose it. */
export function readStoredName(): string {
  try {
    return sessionStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeName(name: string): void {
  try {
    if (name.trim()) sessionStorage.setItem(NAME_KEY, name);
    else sessionStorage.removeItem(NAME_KEY);
  } catch {
    // Storage can be off or full; the name still reaches the other tabs through awareness.
  }
}

export const setLocalUser = (awareness: Awareness, user: User): void =>
  awareness.setLocalStateField("user", user);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

/** Awareness states come from other tabs, so they are checked before they reach the page. */
const parseUser = (value: unknown): User | null => {
  if (!isRecord(value)) return null;
  const { name, color, anonymous } = value;
  if (typeof name !== "string" || typeof color !== "string") return null;
  return {
    name: name.slice(0, 40),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#64748b",
    anonymous: anonymous === true,
  };
};

const parseCursor = (value: unknown): Peer["cursor"] =>
  isRecord(value) && "anchor" in value && "head" in value
    ? { anchor: value.anchor, head: value.head }
    : null;

/** Everyone in the room, this tab first, then in a stable order. */
export function readPeers(awareness: Awareness): Peer[] {
  const peers: Peer[] = [];
  awareness.getStates().forEach((state, clientId) => {
    const user = parseUser(state.user);
    if (!user) return;
    peers.push({
      ...user,
      clientId,
      isLocal: clientId === awareness.clientID,
      cursor: parseCursor(state.cursor),
    });
  });
  return peers.sort(
    (a, b) => Number(b.isLocal) - Number(a.isLocal) || a.clientId - b.clientId,
  );
}

/**
 * Pins an offset to the character before it (`assoc` -1), so text typed at the caret by
 * someone else lands after the caret instead of pushing it along. Two people typing at the
 * same spot then each keep writing their own run rather than interleaving.
 */
const toRelative = (text: Y.Text, index: number): unknown =>
  Y.relativePositionToJSON(
    Y.createRelativePositionFromTypeIndex(text, index, -1),
  );

/** The offset a relative position points at now, or null if this tab cannot place it yet. */
const toIndex = (text: Y.Text, position: unknown): number | null => {
  if (!text.doc) return null;
  try {
    const absolute = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON(position),
      text.doc,
    );
    // Null when the position names an edit this tab has not received yet.
    return absolute?.type === text ? absolute.index : null;
  } catch {
    return null;
  }
};

/** Publishes this tab's selection, or clears it while the editor is not focused. */
export function setLocalCursor(
  awareness: Awareness,
  text: Y.Text,
  selection: Selection | null,
): void {
  const cursor = selection && {
    anchor: toRelative(text, selection.anchor),
    head: toRelative(text, selection.head),
  };
  // An edit reports the caret, and then the selection event reports it again. Every awareness
  // update is broadcast, changed or not, so the repeat is dropped here.
  const current = awareness.getLocalState()?.cursor ?? null;
  if (JSON.stringify(current) === JSON.stringify(cursor)) return;
  awareness.setLocalStateField("cursor", cursor);
}

/** Where a peer's selection sits in the text as it is now. */
export function resolveCursor(
  text: Y.Text,
  cursor: Peer["cursor"],
): Selection | null {
  if (!cursor) return null;
  const anchor = toIndex(text, cursor.anchor);
  const head = toIndex(text, cursor.head);
  return anchor === null || head === null ? null : { anchor, head };
}

/** Where this tab's own selection belongs after the text changed under it. */
export function resolveLocalCursor(
  awareness: Awareness,
  text: Y.Text,
): Selection | null {
  return resolveCursor(text, parseCursor(awareness.getLocalState()?.cursor));
}
