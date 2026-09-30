import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { llmsTxt } from "../content/llm.server.ts";
import { servedMarkdown } from "../content/llm.server.ts";
import { loadManifest } from "../content/manifest.server.ts";
import { renderMarkdown } from "../content/markdown.server.ts";
import { formatErrors } from "../content/parse.server.ts";

// The gate for everything under packages/*/docs, packages/*/CHANGELOG.md and apps/docs/content:
// frontmatter, structure, links and anchors, fence languages, raw HTML.

const origin = "https://docs.test";
const manifest = loadManifest();

describe("docs content", () => {
  it("has valid structure and frontmatter", () => {
    expect(formatErrors(manifest.errors)).toBe("");
  });

  it("documents every public package", () => {
    expect(manifest.missingDocs).toEqual([]);
  });

  it.each(manifest.pages.map((page) => [page.repoPath, page] as const))(
    "%s renders and serves as markdown",
    async (_, page) => {
      const source = readFileSync(page.file, "utf8");
      const rendered = await renderMarkdown(source, { page, manifest, origin });
      expect(formatErrors(rendered.errors)).toBe("");
      const served = servedMarkdown(source, page, manifest, origin);
      expect(formatErrors(served.errors)).toBe("");
    },
  );

  it("lists every page in llms.txt", () => {
    const text = llmsTxt(manifest, origin);
    for (const page of manifest.pages) {
      expect(text).toContain(`(${origin}${page.mdPath})`);
    }
  });
});
