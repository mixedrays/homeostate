import { readFileSync } from "node:fs";
import { groups, site } from "../site.config.ts";
import { destinationRange, resolveTreeUrls } from "./links.server.ts";
import type { Manifest, SourcePackage, SourcePage } from "./manifest.server.ts";
import {
  ContentValidationError,
  parseMarkdown,
  splitFrontmatter,
  type ContentError,
} from "./parse.server.ts";

/**
 * The page as served at `<path>.md`: the source file without its frontmatter, with links
 * rewritten to absolute .md URLs. Nothing else changes, so the text is what the author wrote.
 */
export function servedMarkdown(
  source: string,
  page: SourcePage,
  manifest: Manifest,
  origin: string,
): { text: string; errors: ContentError[] } {
  const tree = parseMarkdown(source);
  const { bodyStart } = splitFrontmatter(tree, source);
  const { occurrences, errors } = resolveTreeUrls(tree, {
    page,
    manifest,
    origin,
  });

  const edits: [number, number, string][] = [];
  for (const { node, resolved } of occurrences) {
    if (resolved.md === node.url) continue;
    const range = destinationRange(node, source);
    if (!range) {
      errors.push({
        file: page.repoPath,
        line: node.position?.start.line,
        message: `could not find the destination of ${node.url} in the source to rewrite it`,
      });
      continue;
    }
    edits.push([range[0], range[1], resolved.md]);
  }

  let text = source;
  for (const [start, end, url] of edits.sort((a, b) => b[0] - a[0])) {
    text = text.slice(0, start) + url + text.slice(end);
  }
  text = text.slice(bodyStart);
  return { text: text.endsWith("\n") ? text : `${text}\n`, errors };
}

export function servedMarkdownOrThrow(
  page: SourcePage,
  manifest: Manifest,
  origin: string,
): string {
  const { text, errors } = servedMarkdown(
    readFileSync(page.file, "utf8"),
    page,
    manifest,
    origin,
  );
  if (errors.length > 0) throw new ContentValidationError(errors);
  return text;
}

function linkText(page: SourcePage, pkg: SourcePackage | undefined) {
  if (!pkg || page.title === pkg.name) return page.title;
  return `${pkg.name}: ${page.title}`;
}

function listItem(
  page: SourcePage,
  pkg: SourcePackage | undefined,
  origin: string,
) {
  return `- [${linkText(page, pkg)}](${origin}${page.mdPath}): ${page.description}`;
}

/** llms.txt (https://llmstxt.org) for the whole site, or for one package. */
export function llmsTxt(
  manifest: Manifest,
  origin: string,
  pkgSlug?: string,
): string {
  const lines: string[] = [];

  if (pkgSlug) {
    const pkg = manifest.packages.find((p) => p.slug === pkgSlug);
    if (!pkg) throw new Error(`Unknown package ${pkgSlug}`);
    lines.push(
      `# ${pkg.name}`,
      "",
      `> ${pkg.description}`,
      "",
      `Version ${pkg.version}. Every link below is plain markdown; all of them in one file: ` +
        `${origin}/docs/${pkg.slug}/llms-full.txt. The index of every ${site.name} package: ${origin}/llms.txt.`,
      "",
      "## Docs",
      "",
      ...manifest.pages
        .filter((p) => p.pkg === pkg.slug)
        .map((p) => listItem(p, pkg, origin)),
    );
    return `${lines.join("\n")}\n`;
  }

  lines.push(
    `# ${site.name}`,
    "",
    `> ${site.summary}`,
    "",
    "Install `@homeostate/core`, one `@homeostate/store-*` adapter for your state manager and one " +
      "`@homeostate/crdt-*` backend for your CRDT library. Every link below is plain markdown; all " +
      `of them in one file: ${origin}/llms-full.txt.`,
  );

  const guides = manifest.pages.filter((p) => p.kind === "guide");
  if (guides.length > 0) {
    lines.push(
      "",
      "## Guides",
      "",
      ...guides.map((p) => listItem(p, undefined, origin)),
    );
  }
  for (const group of groups) {
    const packages = manifest.packages.filter((p) => p.group === group.id);
    if (packages.length === 0) continue;
    lines.push("", `## ${group.title}`, "");
    for (const pkg of packages) {
      lines.push(
        ...manifest.pages
          .filter((p) => p.pkg === pkg.slug)
          .map((p) => listItem(p, pkg, origin)),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Every page's served markdown in one file, each preceded by its URL. */
export function llmsFullTxt(
  manifest: Manifest,
  origin: string,
  pkgSlug?: string,
): string {
  const pkg = pkgSlug
    ? manifest.packages.find((p) => p.slug === pkgSlug)
    : undefined;
  if (pkgSlug && !pkg) throw new Error(`Unknown package ${pkgSlug}`);
  const pages = pkg
    ? manifest.pages.filter((p) => p.pkg === pkg.slug)
    : manifest.pages;
  const header = pkg
    ? [`# ${pkg.name} documentation`, "", `> ${pkg.description}`]
    : [`# ${site.name} documentation`, "", `> ${site.summary}`];
  const docs = pages.map(
    (page) =>
      `---\nurl: ${origin}${page.mdPath}\n---\n\n${servedMarkdownOrThrow(page, manifest, origin)}`,
  );
  return `${header.join("\n")}\n\n${docs.join("\n")}`;
}

export function sitemapXml(manifest: Manifest, origin: string): string {
  const urls = ["/", ...manifest.pages.map((p) => p.path)].map(
    (path) => `  <url><loc>${origin}${path}</loc></url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
