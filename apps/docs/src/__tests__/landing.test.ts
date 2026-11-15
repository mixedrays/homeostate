import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BENEFITS, INSTALL, QUICKSTART } from "../content/landing.server.ts";
import { loadManifest } from "../content/manifest.server.ts";
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

describe("landing page package cards", () => {
  const { packages } = loadManifest();

  // Store and other cards stay label + package name.
  it("gives a short hint to every CRDT backend and no other package", () => {
    const hinted = packages.filter((p) => p.hint).map((p) => p.slug);
    expect(hinted).toEqual(
      packages.filter((p) => p.group === "crdt").map((p) => p.slug),
    );
    expect(hinted.length).toBeGreaterThan(0);
    for (const pkg of packages) {
      expect(pkg.hint?.length ?? 0).toBeLessThanOrEqual(90);
    }
  });
});

describe("landing page benefits", () => {
  const manifest = loadManifest();

  it.each(BENEFITS.map((b) => [b.link.to] as const))(
    "%s is a page heading",
    (to) => {
      const [pathname, id] = to.split("#");
      expect(manifest.byPath.get(pathname)?.anchors.has(id)).toBe(true);
    },
  );
});
