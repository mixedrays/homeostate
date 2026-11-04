import { vi } from "vitest";

/**
 * Node's Web Locks implementation, which jsdom's `navigator` lacks. Node exports it from
 * `worker_threads` too, and the installed `@types/node` does not declare it yet.
 */
const { locks } = (await import("node:worker_threads")) as unknown as {
  locks: LockManager;
};

/** Gives jsdom's `navigator` Node's `locks`, until `vi.unstubAllGlobals()`. */
export const stubNodeLocks = (): void => {
  vi.stubGlobal("navigator", { locks });
};
