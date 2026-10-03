import type { WebsocketProvider } from "y-websocket";
import type { Point } from "./shapes";

/**
 * Who is on the board, where their pointer is and what they have selected. None of this is
 * board state, so it travels over Yjs awareness rather than through the store: it belongs to
 * one tab, and it disappears when the tab closes or goes offline.
 */

export type Awareness = WebsocketProvider["awareness"];

export interface User {
  name: string;
  color: string;
  /** True while the user goes by the generated name instead of one they typed. */
  anonymous: boolean;
}

export interface Peer extends User {
  clientId: number;
  isLocal: boolean;
  /** In board pixels, or null while the pointer is off the board. */
  pointer: Point | null;
  /** The id of the shape this peer has selected. */
  selected: string | null;
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

export const MAX_NAME_LENGTH = 32;

export const toUser = (identity: Identity, name: string): User => {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  return {
    name: trimmed || identity.anonymousName,
    color: identity.color,
    anonymous: trimmed === "",
  };
};

const NAME_KEY = "homeostate-whiteboard:name";

/**
 * The name this tab joined under, kept per tab so a reload does not ask again: empty for
 * anonymous, or null if the tab has not joined yet.
 */
export function readJoinedName(): string | null {
  try {
    return sessionStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function storeJoinedName(name: string): void {
  try {
    sessionStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // Storage can be off or full; the tab just asks again after a reload.
  }
}

export const setLocalUser = (awareness: Awareness, user: User): void =>
  awareness.setLocalStateField("user", user);

/**
 * Every awareness update is broadcast, changed or not, so one that repeats the current value
 * is dropped here.
 */
function setLocalField(
  awareness: Awareness,
  field: string,
  value: unknown,
): void {
  const current = awareness.getLocalState()?.[field] ?? null;
  if (JSON.stringify(current) === JSON.stringify(value)) return;
  awareness.setLocalStateField(field, value);
}

export const setLocalSelection = (
  awareness: Awareness,
  id: string | null,
): void => setLocalField(awareness, "selected", id);

/**
 * Publishes this tab's pointer at most once per `interval`, always ending on the latest
 * position. Leaving the board is published at once, so the cursor does not linger.
 */
export function createPointerPublisher(awareness: Awareness, interval = 40) {
  let latest: Point | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timer = undefined;
    setLocalField(awareness, "pointer", latest);
  };

  return (point: Point | null) => {
    latest = point;
    if (point === null) {
      clearTimeout(timer);
      flush();
    } else {
      timer ??= setTimeout(flush, interval);
    }
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

/** Awareness states come from other tabs, so they are checked before they reach the page. */
const parseUser = (value: unknown): User | null => {
  if (!isRecord(value)) return null;
  const { name, color, anonymous } = value;
  if (typeof name !== "string" || typeof color !== "string") return null;
  return {
    name: name.slice(0, MAX_NAME_LENGTH),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#64748b",
    anonymous: anonymous === true,
  };
};

const parsePoint = (value: unknown): Point | null =>
  isRecord(value) &&
  typeof value.x === "number" &&
  Number.isFinite(value.x) &&
  typeof value.y === "number" &&
  Number.isFinite(value.y)
    ? { x: value.x, y: value.y }
    : null;

/**
 * Everyone who has joined the board, this tab first, then in a stable order. A tab that is
 * still choosing its name has no user yet and is left out.
 */
export function readPeers(awareness: Awareness): Peer[] {
  const peers: Peer[] = [];
  awareness.getStates().forEach((state, clientId) => {
    const user = parseUser(state.user);
    if (!user) return;
    peers.push({
      ...user,
      clientId,
      isLocal: clientId === awareness.clientID,
      pointer: parsePoint(state.pointer),
      selected: typeof state.selected === "string" ? state.selected : null,
    });
  });
  return peers.sort(
    (a, b) => Number(b.isLocal) - Number(a.isLocal) || a.clientId - b.clientId,
  );
}

/** Up to two letters for an avatar: "Ada Lovelace" is AL, "Anonymous Otter" is AO. */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0].toUpperCase())
    .join("");
