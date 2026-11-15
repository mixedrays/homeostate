import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INSTALL, QUICKSTART } from "../content/landing.server.ts";
import { guidesDir, packagesDir } from "../content/paths.server.ts";

const guide = readFileSync(path.join(guidesDir, "getting-started.md"), "utf8");

/** The body of the first fence whose info string starts with `info`. */
function fence(markdown: string, info: string) {
  const start = markdown.indexOf(`\`\`\`${info}`);
  expect(start, `no \`\`\`${info} fence`).toBeGreaterThanOrEqual(0);
  const body = markdown.indexOf("\n", start) + 1;
  return markdown.slice(body, markdown.indexOf("\n```", body));
}

describe("landing page quick start", () => {
  it("installs what the getting-started guide installs", () => {
    expect(fence(INSTALL, "bash install")).toBe(fence(guide, "bash install"));
  });

  // The guide's counter.ts is typechecked and tested (playground-react quickstart.test.tsx).
  it("is the guide's src/counter.ts, trimmed", () => {
    const counter = new Set(
      fence(guide, 'ts title="src/counter.ts"').split("\n"),
    );
    const own = fence(QUICKSTART, "ts")
      .split("\n")
      .filter((line) => line !== "" && !counter.has(line));
    // A one-line provider and store-zustand's README way of connecting, instead of `synced`.
    expect(own).toEqual([
      "const doc = new Y.Doc();",
      'const provider = new WebsocketProvider("ws://localhost:1234", "counter", doc);',
      'provider.once("sync", () => useCounter.homeostate.connect());',
    ]);
    const readme = readFileSync(
      path.join(packagesDir, "store-zustand/README.md"),
      "utf8",
    );
    expect(readme).toContain(own[2]);
  });
});
