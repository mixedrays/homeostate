import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { Definition, Image, Link, Root } from "mdast";
import { visit } from "unist-util-visit";
import { site } from "../site.config.ts";
import type { Manifest, SourcePage } from "./manifest.server.ts";
import type { ContentError } from "./parse.server.ts";
import { repoRoot, toRepoPath } from "./paths.server.ts";

/** Where a link in the source points, once for the HTML page and once for the served .md. */
export interface ResolvedUrl {
  html: string;
  md: string;
}

export interface LinkContext {
  page: SourcePage;
  manifest: Manifest;
  /** Absolute origin used in the served .md, e.g. https://homeostate.org */
  origin: string;
}

type UrlNode = Link | Image | Definition;

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function splitHash(url: string): [string, string] {
  const i = url.indexOf("#");
  return i === -1 ? [url, ""] : [url.slice(0, i), url.slice(i)];
}

function checkAnchor(target: SourcePage, hash: string): string | undefined {
  if (!hash || hash === "#") return undefined;
  const id = decodeURIComponent(hash.slice(1));
  return target.anchors.has(id)
    ? undefined
    : `${target.repoPath} has no heading #${id}`;
}

/** Site paths that exist without being a docs page. */
function isGeneratedPath(manifest: Manifest, pathname: string): boolean {
  if (["/", "/llms.txt", "/llms-full.txt", "/sitemap.xml"].includes(pathname))
    return true;
  if (manifest.redirects.some((r) => r.from === pathname)) return true;
  return manifest.packages.some(
    (pkg) =>
      pathname === `/docs/${pkg.slug}/llms.txt` ||
      pathname === `/docs/${pkg.slug}/llms-full.txt`,
  );
}

export function resolveUrl(
  url: string,
  kind: "link" | "image",
  ctx: LinkContext,
): ResolvedUrl | { error: string } {
  const { page, manifest, origin } = ctx;

  if (SCHEME.test(url) || url.startsWith("//")) return { html: url, md: url };

  if (url.startsWith("#")) {
    const error = checkAnchor(page, url);
    return error ? { error } : { html: url, md: url };
  }

  const [rawPath, hash] = splitHash(url);

  if (rawPath.startsWith("/")) {
    const pathname = rawPath.replace(/\/+$/, "") || "/";
    const target = manifest.byPath.get(pathname);
    if (target) {
      const error = checkAnchor(target, hash);
      return error
        ? { error }
        : {
            html: `${pathname}${hash}`,
            md: `${origin}${target.mdPath}${hash}`,
          };
    }
    const asset = manifest.assets.find((a) => a.path === pathname);
    if (asset || isGeneratedPath(manifest, pathname)) {
      return { html: `${pathname}${hash}`, md: `${origin}${pathname}${hash}` };
    }
    return { error: `${pathname} is not a page on the site` };
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath.split("?")[0]);
  } catch {
    return { error: `${url} is not a valid URL` };
  }
  const file = path.resolve(path.dirname(page.file), decoded);

  if (kind === "image") {
    const asset = manifest.assets.find((a) => a.file === file);
    if (!asset) {
      return {
        error: `images must live in the docs assets/ folder (${decoded})`,
      };
    }
    return { html: asset.path, md: `${origin}${asset.path}` };
  }

  const target = manifest.byFile.get(file);
  if (target) {
    const error = checkAnchor(target, hash);
    return error
      ? { error }
      : {
          html: `${target.path}${hash}`,
          md: `${origin}${target.mdPath}${hash}`,
        };
  }
  if (manifest.draftFiles.has(file)) {
    return { error: `${toRepoPath(file)} is a draft and is not published` };
  }
  if (!file.startsWith(repoRoot + path.sep) || !existsSync(file)) {
    return { error: `${decoded} does not exist` };
  }

  // Any other file in the repository: link to it on GitHub.
  const kindSegment = statSync(file).isDirectory() ? "tree" : "blob";
  const github = `${site.repo}/${kindSegment}/${site.branch}/${toRepoPath(file)}${hash}`;
  return { html: github, md: github };
}

export interface UrlOccurrence {
  node: UrlNode;
  resolved: ResolvedUrl;
}

/**
 * Resolves every link, definition and image in the tree. Reference-style links resolve through
 * their definition, so only definitions carry a URL.
 */
export function resolveTreeUrls(
  tree: Root,
  ctx: LinkContext,
): { occurrences: UrlOccurrence[]; errors: ContentError[] } {
  const occurrences: UrlOccurrence[] = [];
  const errors: ContentError[] = [];
  visit(tree, (node) => {
    if (
      node.type !== "link" &&
      node.type !== "image" &&
      node.type !== "definition"
    )
      return;
    const result = resolveUrl(
      node.url,
      node.type === "image" ? "image" : "link",
      ctx,
    );
    if ("error" in result) {
      errors.push({
        file: ctx.page.repoPath,
        line: node.position?.start.line,
        message: result.error,
      });
    } else {
      occurrences.push({ node, resolved: result });
    }
  });
  return { occurrences, errors };
}

/**
 * The [start, end) offsets of a node's destination in the source, or undefined for autolinks,
 * which are always absolute URLs and never rewritten.
 */
export function destinationRange(
  node: UrlNode,
  source: string,
): [number, number] | undefined {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return undefined;

  let from: number;
  if (node.type === "definition") {
    const colon = source.indexOf("]:", start);
    if (colon === -1 || colon >= end) return undefined;
    from = colon + 2;
  } else {
    if (source[start] !== "[" && source.slice(start, start + 2) !== "![")
      return undefined;
    const labelEnd =
      node.type === "link" && node.children.length > 0
        ? (node.children[node.children.length - 1].position?.end.offset ??
          start)
        : start;
    const bracket = source.indexOf("](", labelEnd);
    if (bracket === -1 || bracket >= end) return undefined;
    from = bracket + 2;
  }

  while (from < end && /\s/.test(source[from])) from++;
  if (source[from] === "<") {
    const close = source.indexOf(">", from);
    return close === -1 || close > end ? undefined : [from + 1, close];
  }
  let to = from;
  let depth = 0;
  while (to < end) {
    const ch = source[to];
    if (/\s/.test(ch)) break;
    if (ch === "(") depth++;
    if (ch === ")") {
      if (depth === 0) break;
      depth--;
    }
    to++;
  }
  return [from, to];
}
