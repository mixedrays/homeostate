/** A seeded source of random numbers: the same seed gives the same numbers. */
export interface Random {
  /** The seed it started from. */
  readonly seed: number;
  /** A number from 0 up to, but not including, 1. */
  next: () => number;
  /** An integer from 0 up to, but not including, `max`. */
  int: (max: number) => number;
  /** True with probability `p`. */
  chance: (p: number) => boolean;
  /** One of `items`; throws on an empty list. */
  pick: <T>(items: readonly T[]) => T;
}

/** A seed for a run that names none, drawn from `Math.random`. */
export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 32);

/** Mulberry32: small and fast, and random enough for test inputs. */
export const createRandom = (seed: number): Random => {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (max: number): number => Math.floor(next() * max);

  return {
    seed,
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0)
        throw new Error("Cannot pick from an empty list.");
      return items[int(items.length)];
    },
  };
};
