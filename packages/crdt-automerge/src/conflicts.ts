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
 * The maps peers each created at `doc[name]` that lose to the one shown, greatest operation
 * first; proxies inside `A.change`, copies otherwise. Uses the hidden `A.getBackend`, since
 * `getConflicts` does not tell a map from a value that reads as an object.
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
 * Inside `A.change`, moves each key `winner` lacks from the first of `losers` holding it, then
 * empties the losers so a key removed later cannot return. A moved value is a copy, so a peer's
 * unseen edit inside it is lost; only a top-level `Counter` holding a number stays a `Counter`.
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
      if (winner[key] === undefined) {
        const value = loser[key];
        // A list proxy claims every property, so `isCounter` alone accepts one.
        if (
          !Array.isArray(value) &&
          A.isCounter(value) &&
          typeof value.value === "number"
        )
          winner[key] = new A.Counter(value.value);
        else assign(winner, key, plain(value), [key], text);
      }
      delete loser[key];
    }
};
