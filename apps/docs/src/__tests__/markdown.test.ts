import path from "node:path";
import type { Element, Root, RootContent } from "hast";
import { describe, expect, it } from "vitest";
import { servedMarkdown } from "../content/llm.server.ts";
import { loadManifest, type SourcePage } from "../content/manifest.server.ts";
import { installCommands, renderMarkdown } from "../content/markdown.server.ts";
import { repoRoot } from "../content/paths.server.ts";

const origin = "https://docs.test";
const manifest = loadManifest();

// A page that doesn't exist on disk, sitting next to the real core docs so relative links
// resolve against the real manifest.
const page: SourcePage = {
  id: "core/fixture",
  kind: "package",
  pkg: "core",
  file: path.join(repoRoot, "packages/core/docs/fixture.md"),
  repoPath: "packages/core/docs/fixture.md",
  path: "/docs/core/fixture",
  mdPath: "/docs/core/fixture.md",
  title: "Fixture",
  label: "Fixture",
  description: "A fixture page.",
  draft: false,
  anchors: new Set(["fixture", "details"]),
};

function doc(body: string) {
  return `---\ndescription: A fixture page.\n---\n\n# Fixture\n\n${body}\n`;
}

async function render(body: string) {
  return renderMarkdown(doc(body), { page, manifest, origin });
}

function elements(tree: Root | Element, tagName: string): Element[] {
  const found: Element[] = [];
  const walk = (node: Root | RootContent) => {
    if (node.type === "element" && node.tagName === tagName) found.push(node);
    if ("children" in node) node.children.forEach(walk);
  };
  walk(tree);
  return found;
}

function hrefs(tree: Root) {
  return elements(tree, "a").map((a) => a.properties.href);
}

describe("renderMarkdown", () => {
  it("leaves the H1 and frontmatter out of the body", async () => {
    const { hast, errors } = await render("Body.");
    expect(errors).toEqual([]);
    expect(elements(hast, "h1")).toEqual([]);
    expect(JSON.stringify(hast)).not.toContain("description");
  });

  it("gives headings GitHub's ids and collects h2/h3 into the TOC", async () => {
    const { hast, toc } = await render(
      "## Install `core`\n\n### Why? Because\n\n#### Deep",
    );
    expect(elements(hast, "h2")[0].properties.id).toBe("install-core");
    expect(toc).toEqual([
      { depth: 2, id: "install-core", text: "Install core" },
      { depth: 3, id: "why-because", text: "Why? Because" },
    ]);
  });

  it("turns GitHub alerts into docs-alert", async () => {
    const { hast, errors } = await render("> [!TIP]\n> Prefer the middleware.");
    expect(errors).toEqual([]);
    const [alert] = elements(hast, "docs-alert");
    expect(alert.properties.kind).toBe("tip");
    expect(JSON.stringify(alert)).toContain("Prefer the middleware.");
    expect(JSON.stringify(alert)).not.toContain("[!TIP]");
  });

  it("keeps a plain blockquote a blockquote", async () => {
    const { hast } = await render("> Just a quote.");
    expect(elements(hast, "docs-alert")).toEqual([]);
    expect(elements(hast, "blockquote")).toHaveLength(1);
  });

  it("highlights code with a title and highlighted lines", async () => {
    const { hast, errors } = await render(
      '```ts title="store.ts" {2}\nconst a = 1;\nconst b = 2;\n```',
    );
    expect(errors).toEqual([]);
    const [code] = elements(hast, "docs-code");
    expect(code.properties).toMatchObject({
      language: "ts",
      title: "store.ts",
    });
    expect(String(code.properties.html)).toContain("highlighted");
    expect(String(code.properties.html)).toContain("--shiki-dark");
  });

  it("turns an install fence into one tab per package manager", async () => {
    const { hast, errors } = await render(
      "```bash install\nnpm install @homeostate/core yjs\n```",
    );
    expect(errors).toEqual([]);
    const [group] = elements(hast, "docs-code-group");
    expect(group.properties.variant).toBe("install");
    const tabs = elements(group, "docs-code");
    expect(tabs.map((t) => t.properties.tab)).toEqual([
      "npm",
      "pnpm",
      "yarn",
      "bun",
    ]);
    expect(String(tabs[1].properties.html)).toContain("@homeostate/core");
  });

  it("groups consecutive tab fences", async () => {
    const { hast, errors } = await render(
      '```ts tab="Zustand"\na;\n```\n\n```ts tab="Redux"\nb;\n```',
    );
    expect(errors).toEqual([]);
    const [group] = elements(hast, "docs-code-group");
    expect(group.properties.variant).toBe("tabs");
    expect(elements(group, "docs-code").map((t) => t.properties.tab)).toEqual([
      "Zustand",
      "Redux",
    ]);
  });

  it("rewrites links to docs files as site paths", async () => {
    const { hast, errors } = await render(
      [
        "[intro](./introduction.md#install)",
        "[yjs](../../crdt-yjs/docs/introduction.md)",
        "[guide](/docs/getting-started)",
        "[here](#details)",
        "[ext](https://example.com/x)",
        "[src](../src/index.ts)",
        "[ref][r]",
        "",
        "[r]: ../../store-zustand/docs/introduction.md",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(hrefs(hast)).toEqual([
      "/docs/core/introduction#install",
      "/docs/crdt-yjs/introduction",
      "/docs/getting-started",
      "#details",
      "https://example.com/x",
      "https://github.com/mixedrays/homeostate/blob/main/packages/core/src/index.ts",
      "/docs/store-zustand/introduction",
    ]);
  });

  it.each([
    ["a missing file", "[x](./nope.md)", "does not exist"],
    ["a missing anchor", "[x](./introduction.md#nope)", "has no heading #nope"],
    ["an unknown site path", "[x](/docs/nope)", "is not a page"],
    ["raw HTML", "<div>hi</div>", "raw HTML"],
    ["a second H1", "# Again", "only the first line may be an H1"],
    ["an unknown language", "```python\nx = 1\n```", 'code language "python"'],
    [
      "unknown code meta",
      "```ts showLineNumbers\nx;\n```",
      "unknown code meta",
    ],
    ["shiki notation", "```ts\nx; // [!code ++]\n```", "[!code]"],
    ["a lone tab fence", '```ts tab="A"\nx;\n```', "at least two"],
    [
      "a bad install fence",
      "```bash install\nnpm run build\n```",
      "install fence",
    ],
    ["an image outside assets/", "![x](../src/index.ts)", "assets/"],
  ])("reports %s", async (_, body, message) => {
    const { errors } = await render(body);
    expect(errors.map((e) => e.message).join("\n")).toContain(message);
  });
});

describe("servedMarkdown", () => {
  it("drops the frontmatter and rewrites only link destinations", () => {
    const source = doc(
      [
        "See [intro](./introduction.md#install) and [yjs](../../crdt-yjs/docs/introduction.md 'Yjs').",
        "",
        "Keep [external](https://example.com) and [anchor](#details) and **bold**.",
        "",
        "```bash install",
        "npm install @homeostate/core",
        "```",
        "",
        "[r]: ./introduction.md",
      ].join("\n"),
    );
    const { text, errors } = servedMarkdown(source, page, manifest, origin);
    expect(errors).toEqual([]);
    expect(text).toBe(
      [
        "# Fixture",
        "",
        `See [intro](${origin}/docs/core/introduction.md#install) and [yjs](${origin}/docs/crdt-yjs/introduction.md 'Yjs').`,
        "",
        "Keep [external](https://example.com) and [anchor](#details) and **bold**.",
        "",
        "```bash install",
        "npm install @homeostate/core",
        "```",
        "",
        `[r]: ${origin}/docs/core/introduction.md`,
        "",
      ].join("\n"),
    );
  });
});

describe("installCommands", () => {
  it("maps dev installs per package manager", () => {
    expect(installCommands("npm install -D vitest")).toEqual({
      npm: "npm install -D vitest",
      pnpm: "pnpm add -D vitest",
      yarn: "yarn add -D vitest",
      bun: "bun add -d vitest",
    });
  });

  it("rejects anything but a plain install", () => {
    expect(installCommands("npm install")).toBeUndefined();
    expect(installCommands("npm install --global x")).toBeUndefined();
    expect(installCommands("pnpm add x")).toBeUndefined();
  });
});
