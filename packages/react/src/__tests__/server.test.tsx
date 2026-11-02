import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSyncEngine } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { useSyncStatus } from "../index";

describe("useSyncStatus on the server", () => {
  it("renders disconnected, whatever the engine holds", () => {
    let state = { count: 0 };
    const engine = createSyncEngine(createMemoryBackend(), {
      getState: () => state,
      setState: (next) => {
        state = next;
      },
      subscribe: () => () => {},
    });
    engine.connect();
    const Badge = () => {
      const { connected, ready, failure } = useSyncStatus(engine);
      return <p>{[connected, ready, failure].join()}</p>;
    };

    const html = renderToString(<Badge />);

    expect(typeof document).toBe("undefined");
    expect(html).toBe("<p>false,false,</p>");
  });
});
