import * as A from "@automerge/automerge";
import { describe, expect, it } from "vitest";
import { createAutomergeOps, type Container } from "../patching.js";

const ROOT = "s/r";

describe("createAutomergeOps", () => {
  // `editText` splices through the document's backend, which leaves the proxies' cached values
  // alone, so this pins that the parent proxy reads the edit back before the change ends.
  it.each([[""], ["a/b"], ["x"]])(
    "reads text it edited under key %j back in the same change",
    (key) => {
      const initial = A.from<Container>({
        [ROOT]: { list: ["l0"], map: { [key]: "hello" } },
      });
      const edited = { [ROOT]: { list: ["L0"], map: { [key]: "hello!" } } };

      const next = A.change(initial, (doc) => {
        const { list, map } = doc[ROOT] as { list: string[]; map: Container };
        // Read before the edit, so the proxies hold the text as it was.
        expect(map[key]).toBe("hello");
        expect(list[0]).toBe("l0");
        const ops = createAutomergeOps(doc, ROOT, () => true);

        ops.editText?.(map[key], 5, 0, "!", ["map", key]);
        ops.editText?.(list[0], 0, 1, "L", ["list", 0]);

        expect(map[key]).toBe("hello!");
        expect(list[0]).toBe("L0");
        expect((doc[ROOT] as { map: Container }).map[key]).toBe("hello!");
        expect(A.toJS(doc)).toEqual(edited);
      });

      expect(A.toJS(next)).toEqual(edited);
    },
  );
});
