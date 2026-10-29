/** Rejects the sleeps of a stopped timeline, so the script awaiting them unwinds. */
export const STOPPED = Symbol("timeline stopped");

export interface Timeline {
  /** Resolves once the timeline has advanced `ms` past now. */
  sleep(ms: number): Promise<void>;
  /** Moves the clock forward; does nothing while paused or stopped. */
  advance(ms: number): void;
  setPaused(paused: boolean): void;
  /** Rejects every pending and later sleep with `STOPPED`. */
  stop(): void;
}

/**
 * A clock for a scripted animation. Its time moves only through `advance`, which the caller
 * drives from animation frames, so pausing it holds the script exactly where it is.
 */
export function createTimeline(): Timeline {
  let now = 0;
  let paused = false;
  let stopped = false;
  let pending: {
    at: number;
    resolve: () => void;
    reject: (reason: unknown) => void;
  }[] = [];

  return {
    sleep(ms) {
      return new Promise((resolve, reject) => {
        if (stopped) reject(STOPPED);
        else pending.push({ at: now + ms, resolve, reject });
      });
    },
    advance(ms) {
      if (paused || stopped) return;
      now += ms;
      const due = pending.filter((sleep) => sleep.at <= now);
      pending = pending.filter((sleep) => sleep.at > now);
      due.forEach((sleep) => sleep.resolve());
    },
    setPaused(value) {
      paused = value;
    },
    stop() {
      stopped = true;
      const waiting = pending;
      pending = [];
      waiting.forEach((sleep) => sleep.reject(STOPPED));
    },
  };
}
