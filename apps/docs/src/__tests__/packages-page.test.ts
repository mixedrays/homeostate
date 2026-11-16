import { readFileSync } from "node:fs";
import type { Node } from "mdast";
import { toString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";
import { resolveTreeUrls } from "../content/links.server.ts";
import { loadManifest } from "../content/manifest.server.ts";
import { formatErrors, parseMarkdown } from "../content/parse.server.ts";
import { groups, site } from "../site.config.ts";

const manifest = loadManifest();

/** Each link's resolved path, keyed by the H2 it sits under. */
function linksByHeading(): Map<string, string[]> {
  const page = manifest.byPath.get(site.packagesPage);
  if (page?.kind !== "guide")
    throw new Error(`${site.packagesPage} is not a guide`);
  const tree = parseMarkdown(readFileSync(page.file, "utf8"));
  const { occurrences, errors } = resolveTreeUrls(tree, {
    page,
    manifest,
    origin: "https://docs.test",
  });
  expect(formatErrors(errors)).toBe("");
  const resolved = new Map<Node, string>(
    occurrences.map((o) => [o.node, o.resolved.html]),
  );

  const byHeading = new Map<string, string[]>();
  let heading = "";
  for (const child of tree.children) {
    if (child.type === "heading" && child.depth === 2) {
      heading = toString(child);
      continue;
    }
    visit(child, "link", (link) => {
      const to = resolved.get(link);
      if (to) byHeading.set(heading, [...(byHeading.get(heading) ?? []), to]);
    });
  }
  return byHeading;
}

describe("packages page", () => {
  it("links every package's introduction under its group's heading", () => {
    const byHeading = linksByHeading();
    expect(manifest.packages.length).toBeGreaterThan(0);
    for (const pkg of manifest.packages) {
      const title = groups.find((g) => g.id === pkg.group)?.title ?? "";
      expect(byHeading.get(title) ?? [], pkg.name).toContain(pkg.path);
    }
  });
});
