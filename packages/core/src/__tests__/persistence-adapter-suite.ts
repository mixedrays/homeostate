import { beforeEach, describe, expect, it } from "vitest";
import type { PersistenceAdapter } from "../index.js";

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

const sorted = (updates: Uint8Array[]): number[][] =>
  updates.map((update) => [...update]).sort((a, b) => a[0] - b[0]);

/**
 * The contract every `PersistenceAdapter` must meet. `create` returns a new adapter over
 * the same storage on each call; `reset` empties that storage before each test.
 */
export const describePersistenceAdapter = (
  name: string,
  create: () => PersistenceAdapter,
  reset: () => void | Promise<void>,
): void => {
  describe(`${name} conforms to PersistenceAdapter`, () => {
    beforeEach(reset);

    it("loads nothing for an unknown key", async () => {
      expect(await create().load("missing")).toEqual({
        updates: [],
        version: 0,
      });
    });

    it("loads appended updates oldest first", async () => {
      const adapter = create();
      await adapter.append("doc", bytes(1, 2));
      await adapter.append("doc", bytes(3));

      const { updates, version } = await adapter.load("doc");

      expect(updates.map((update) => [...update])).toEqual([[1, 2], [3]]);
      expect(updates[0]).toBeInstanceOf(Uint8Array);
      expect(version).toBeGreaterThan(0);
    });

    it("keeps keys apart", async () => {
      const adapter = create();
      await adapter.append("a", bytes(1));
      await adapter.append("b", bytes(2));

      expect(sorted((await adapter.load("a")).updates)).toEqual([[1]]);
      expect(sorted((await adapter.load("b")).updates)).toEqual([[2]]);
    });

    it("stores only the viewed bytes of a subarray", async () => {
      const adapter = create();
      await adapter.append("doc", bytes(9, 1, 2, 9).subarray(1, 3));

      const [update] = (await create().load("doc")).updates;

      expect([...update]).toEqual([1, 2]);
    });

    it("outlives the adapter that wrote it", async () => {
      await create().append("doc", bytes(1));

      expect(sorted((await create().load("doc")).updates)).toEqual([[1]]);
    });

    it("compacts up to the loaded version and keeps later updates", async () => {
      const adapter = create();
      await adapter.append("doc", bytes(1));
      await adapter.append("doc", bytes(2));
      const { version } = await adapter.load("doc");
      await adapter.append("doc", bytes(3));
      await adapter.append("other", bytes(4));

      await adapter.compact("doc", bytes(5), version);

      const after = await adapter.load("doc");
      expect(sorted(after.updates)).toEqual([[3], [5]]);
      expect(after.version).toBeGreaterThan(version);
      expect(sorted((await adapter.load("other")).updates)).toEqual([[4]]);
    });

    it("keeps a concurrent compaction's snapshot", async () => {
      const first = create();
      const second = create();
      await first.append("doc", bytes(1));
      const seen = await first.load("doc");
      await second.append("doc", bytes(2));
      const seenBySecond = await second.load("doc");

      await second.compact("doc", bytes(3), seenBySecond.version);
      await first.compact("doc", bytes(4), seen.version);

      expect(sorted((await create().load("doc")).updates)).toEqual([[3], [4]]);
    });

    it("compacts an empty key into its snapshot", async () => {
      const adapter = create();
      await adapter.compact("doc", bytes(1), 0);

      expect(sorted((await adapter.load("doc")).updates)).toEqual([[1]]);
    });

    it("clears one key", async () => {
      const adapter = create();
      await adapter.append("doc", bytes(1));
      await adapter.append("other", bytes(2));

      await adapter.clear("doc");

      expect(await adapter.load("doc")).toEqual({ updates: [], version: 0 });
      expect(sorted((await adapter.load("other")).updates)).toEqual([[2]]);
    });
  });
};
