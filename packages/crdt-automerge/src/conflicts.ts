import * as A from "@automerge/automerge";
import type { TextPolicy } from "@homeostate/core";
import { assign, type Container } from "./patching.js";
import { createSnapshot } from "./snapshot.js";

/** Splits an operation ID, `counter@actor`. */
const parseOpId = (id: string): [counter: number, actor: string] => {
  const at = id.indexOf("@");
  return [Number(id.slice(0, at)), id.slice(at + 1)];
};

/**
 * Orders operation IDs the way Automerge picks the winner of concurrent values: by counter, then
 * by actor. Hex actors compare as their bytes do.
 */
const compareOpIds = (a: string, b: string): number => {
  const [counterA, actorA] = parseOpId(a);
  const [counterB, actorB] = parseOpId(b);
  if (counterA !== counterB) return counterA - counterB;
  return actorA < actorB ? -1 : actorA > actorB ? 1 : 0;
};

/**
 * The maps at `doc[name]` that lose to the value it shows, the one by the greatest operation
 * first. Peers that each create the synced map, each in a document without it, leave one map
 * per peer at the key, and Automerge shows only the winner. Inside `A.change`, given the draft,
 * each is a proxy to edit; otherwise it is a copy.
 *
 * Reads the document's backend, although `A.getBackend` is marked hidden, as `getConflicts`
 * does, because `getConflicts` does not tell a map from a value that reads as an object.
 */
export const losingMaps = (doc: Container, name: string): Container[] => {
  const values = A.getBackend(doc).getAll("_root", name);
  if (values.length <= 1) return [];
  const conflicts = A.getConflicts(doc, name)!;
  const ids = values.map((value) => (value.length === 2 ? value[1] : value[2]));
  const winner = ids.reduce((a, b) => (compareOpIds(a, b) >= 0 ? a : b));
  return values
    .flatMap((value) =>
      value[0] === "map" && value[1] !== winner ? [value[1]] : [],
    )
    .sort((a, b) => compareOpIds(b, a))
    .map((id) => conflicts[id] as Container);
};

/**
 * Inside `A.change`, moves every key of `losers`, the proxies `losingMaps` returns, that
 * `winner` lacks into it, from the first loser that holds it, and then empties the losers, so a
 * key removed from the winner later cannot come back from one of them. `text` decides which
 * moved strings are stored as text.
 *
 * A moved value is a copy, so a peer's change inside it that the move has not seen, made in
 * the losing map, is no longer read. A key that such a peer adds to its map is moved by the
 * next write.
 */
export const moveLosingKeys = (
  winner: Container,
  losers: readonly Container[],
  text: TextPolicy | undefined,
): void => {
  const plain = createSnapshot();
  for (const loser of losers)
    for (const key of Object.keys(loser)) {
      // A map holds no `undefined`, so this is a key the winner lacks.
      if (winner[key] === undefined)
        assign(winner, key, plain(loser[key]), [key], text);
      delete loser[key];
    }
};
