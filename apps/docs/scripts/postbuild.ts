import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { getManifest, type Manifest } from "../src/content/manifest.server.ts";

// Adapts React Router's prerendered output (build/client) to Cloudflare Pages. Runs from
// buildEnd in react-router.config.ts, after prerendering.

function walk(dir: string, visit: (file: string) => void) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

/**
 * `x/index.html` → `x.html`. Pages serves `x/index.html` at `/x/` and redirects `/x` there, but
 * serves `x.html` at `/x`, the URL every link uses.
 */
function flattenHtml(clientDir: string): number {
  let count = 0;
  const visitDir = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) visitDir(path.join(dir, entry.name));
    }
    const index = path.join(dir, "index.html");
    if (dir === clientDir || !existsSync(index)) return;
    renameSync(index, `${dir}.html`);
    count++;
    if (readdirSync(dir).length === 0) rmdirSync(dir);
  };
  visitDir(clientDir);
  return count;
}

/**
 * Prerender writes a .data file for resource routes too (`intro.md.data`); nothing requests them,
 * since links to .md, .txt and assets are plain documents.
 */
function removeResourceData(clientDir: string): number {
  let count = 0;
  walk(clientDir, (file) => {
    if (/\.(md|txt|xml|json|svg|png|jpe?g|gif|webp|avif)\.data$/.test(file)) {
      rmSync(file);
      count++;
    }
  });
  return count;
}

const HEADERS = `/*.md
  Content-Type: text/markdown; charset=utf-8
  X-Robots-Tag: noindex
/*.txt
  Content-Type: text/plain; charset=utf-8
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;

function redirects(manifest: Manifest): string {
  return (
    manifest.redirects.map((r) => `${r.from} ${r.to} 301`).join("\n") + "\n"
  );
}

function assertOutput(clientDir: string, manifest: Manifest) {
  const missing: string[] = [];
  const expect = (rel: string) => {
    if (!existsSync(path.join(clientDir, rel))) missing.push(rel);
  };
  for (const page of manifest.pages) {
    expect(`${page.path.slice(1)}.html`);
    expect(page.mdPath.slice(1));
  }
  for (const pkg of manifest.packages) {
    expect(`docs/${pkg.slug}/llms.txt`);
    expect(`docs/${pkg.slug}/llms-full.txt`);
  }
  [
    "index.html",
    "404.html",
    "llms.txt",
    "llms-full.txt",
    "sitemap.xml",
    "robots.txt",
    "search-index.json",
  ].forEach(expect);

  const stray: string[] = [];
  walk(clientDir, (file) => {
    if (
      path.basename(file) === "index.html" &&
      path.dirname(file) !== clientDir
    )
      stray.push(file);
  });
  if (missing.length > 0 || stray.length > 0) {
    throw new Error(
      `Postbuild: unexpected output in ${clientDir}\n` +
        missing.map((f) => `  missing ${f}`).join("\n") +
        stray
          .map((f) => `\n  left over ${path.relative(clientDir, f)}`)
          .join(""),
    );
  }
}

// Strings that survive minification in libraries only loaders may use. `.server.ts` modules
// already fail the build when client code imports them; this catches a server-only package
// imported from a client module directly.
const SERVER_ONLY_MARKERS = [
  "ShikiError",
  "ZodError",
  "YAMLParseError",
  "user-content-",
];

function assertClientBundle(clientDir: string) {
  const leaks: string[] = [];
  walk(path.join(clientDir, "assets"), (file) => {
    if (!file.endsWith(".js")) return;
    const code = readFileSync(file, "utf8");
    for (const marker of SERVER_ONLY_MARKERS) {
      if (code.includes(marker))
        leaks.push(`${path.relative(clientDir, file)} contains ${marker}`);
    }
  });
  if (leaks.length > 0) {
    throw new Error(
      `Postbuild: build-time code reached the client bundle\n  ${leaks.join("\n  ")}`,
    );
  }
}

export async function postbuild(clientDir: string) {
  if (!process.env.SITE_URL) {
    console.warn(
      "⚠️  SITE_URL is not set: absolute URLs in this build point at the dev origin.",
    );
  }
  const manifest = getManifest();
  const flattened = flattenHtml(clientDir);

  const fallback = path.join(clientDir, "__spa-fallback.html");
  if (!existsSync(fallback))
    throw new Error("Postbuild: React Router wrote no __spa-fallback.html");
  renameSync(fallback, path.join(clientDir, "404.html"));

  const removed = removeResourceData(clientDir);
  writeFileSync(path.join(clientDir, "_headers"), HEADERS);
  writeFileSync(path.join(clientDir, "_redirects"), redirects(manifest));

  assertOutput(clientDir, manifest);
  assertClientBundle(clientDir);

  const size = (rel: string) =>
    `${(statSync(path.join(clientDir, rel)).size / 1024).toFixed(1)} kB`;
  console.log(
    `Postbuild: ${manifest.pages.length} pages, ${flattened} HTML files flattened, ` +
      `${removed} resource .data files removed, 404.html, _headers, _redirects; ` +
      `llms-full.txt ${size("llms-full.txt")}, search-index.json ${size("search-index.json")}`,
  );
}
