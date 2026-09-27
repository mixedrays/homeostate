import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { toString } from "mdast-util-to-string";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { groups, packageNav, site } from "../site.config.ts";
import type {
  GroupId,
  PackageSummary,
  PageKind,
  PageSummary,
} from "./types.ts";
import {
  ContentValidationError,
  headingIds,
  leadingTitle,
  parseMarkdown,
  splitFrontmatter,
  type ContentError,
} from "./parse.server.ts";
import { guidesDir, packagesDir, toRepoPath } from "./paths.server.ts";

const frontmatterSchema = z.strictObject({
  description: z.string().min(1).max(160),
  label: z.string().min(1).optional(),
  order: z.number().optional(),
  draft: z.boolean().optional(),
});

export interface SourcePage {
  id: string;
  kind: PageKind;
  /** Package slug; undefined for guides. */
  pkg?: string;
  file: string;
  repoPath: string;
  path: string;
  mdPath: string;
  title: string;
  label: string;
  description: string;
  order?: number;
  draft: boolean;
  /** Heading ids, for validating `#anchor` links. */
  anchors: Set<string>;
}

export interface SourcePackage extends PackageSummary {
  dir: string;
}

export interface Asset {
  file: string;
  path: string;
}

export interface Redirect {
  from: string;
  to: string;
}

export interface Manifest {
  /** In sidebar order: guides, then each group's packages and their pages. */
  pages: SourcePage[];
  packages: SourcePackage[];
  assets: Asset[];
  redirects: Redirect[];
  /** Slugs of packages without docs/introduction.md; they are left off the site. */
  missingDocs: string[];
  /** Draft files left out of this build, so links to them can be reported. */
  draftFiles: Set<string>;
  byFile: Map<string, SourcePage>;
  byPath: Map<string, SourcePage>;
  errors: ContentError[];
}

const ASSET_EXTENSIONS = new Set([
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
]);

function includeDrafts() {
  return process.env.NODE_ENV !== "production";
}

function groupOf(slug: string): GroupId {
  if (slug === "core") return "core";
  if (slug.startsWith("crdt-")) return "crdt";
  if (slug.startsWith("store-")) return "store";
  return "core";
}

function readPage(
  file: string,
  kind: PageKind,
  pathname: string,
  id: string,
  pkg: string | undefined,
  errors: ContentError[],
): SourcePage {
  const repoPath = toRepoPath(file);
  const source = readFileSync(file, "utf8");
  const tree = parseMarkdown(source);
  const { yaml } = splitFrontmatter(tree, source);
  const h1 = leadingTitle(tree);
  const title = h1 ? toString(h1) : path.basename(file, ".md");
  if (!h1) {
    errors.push({
      file: repoPath,
      line: 1,
      message: "the page must start with an H1 title",
    });
  }

  let fm: z.infer<typeof frontmatterSchema> = { description: "" };
  if (kind === "changelog") {
    fm = {
      description: `Release notes for ${pkg ? `@homeostate/${pkg}` : "this package"}.`,
    };
  } else {
    let data: unknown = {};
    try {
      data = yaml === undefined ? {} : (parseYaml(yaml) ?? {});
    } catch (error) {
      errors.push({
        file: repoPath,
        line: 1,
        message: `frontmatter is not valid YAML: ${String(error)}`,
      });
    }
    const parsed = frontmatterSchema.safeParse(data);
    if (parsed.success) {
      fm = parsed.data;
    } else {
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "frontmatter";
        errors.push({
          file: repoPath,
          line: 1,
          message: `frontmatter ${key}: ${issue.message}`,
        });
      }
    }
  }

  return {
    id,
    kind,
    pkg,
    file,
    repoPath,
    path: pathname,
    mdPath: `${pathname}.md`,
    title: kind === "changelog" ? "Changelog" : title,
    label: kind === "changelog" ? "Changelog" : (fm.label ?? title),
    description: fm.description,
    order: fm.order,
    draft: fm.draft ?? false,
    anchors: new Set(headingIds(tree).values()),
  };
}

function byOrderThenLabel(a: SourcePage, b: SourcePage) {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  return ao === bo ? a.label.localeCompare(b.label) : ao - bo;
}

function listMarkdown(
  dir: string,
  errors: ContentError[],
  allowedDirs: string[],
): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!allowedDirs.includes(entry.name)) {
        errors.push({
          file: toRepoPath(full),
          message: `nested folders are not supported yet (only ${allowedDirs.join(", ")})`,
        });
      }
    } else if (entry.name.endsWith(".md")) {
      files.push(full);
    } else if (!entry.name.startsWith(".")) {
      errors.push({
        file: toRepoPath(full),
        message: "only .md files belong here",
      });
    }
  }
  return files.sort();
}

function listAssets(
  dir: string,
  urlBase: string,
  errors: ContentError[],
): Asset[] {
  if (!existsSync(dir)) return [];
  const assets: Asset[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (
      entry.isFile() &&
      ASSET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      assets.push({ file: full, path: `${urlBase}/${entry.name}` });
    } else if (!entry.name.startsWith(".")) {
      errors.push({
        file: toRepoPath(full),
        message: "assets/ holds images only, without subfolders",
      });
    }
  }
  return assets;
}

function buildManifest(): Manifest {
  const errors: ContentError[] = [];
  const drafts = includeDrafts();
  const draftFiles = new Set<string>();
  const assets: Asset[] = [];

  const keep = (page: SourcePage) => {
    if (page.draft && !drafts) {
      draftFiles.add(page.file);
      return false;
    }
    return true;
  };

  // Guides: apps/docs/content/*.md → /docs/<name>
  const guides = existsSync(guidesDir)
    ? listMarkdown(guidesDir, errors, ["assets"])
        .map((file) => {
          const name = path.basename(file, ".md");
          return readPage(
            file,
            "guide",
            `/docs/${name}`,
            name,
            undefined,
            errors,
          );
        })
        .filter(keep)
        .sort(byOrderThenLabel)
    : [];
  assets.push(
    ...listAssets(path.join(guidesDir, "assets"), "/docs/assets", errors),
  );

  // Packages: packages/<slug>/docs/*.md → /docs/<slug>/<name>, plus CHANGELOG.md
  const packages: SourcePackage[] = [];
  const packagePages = new Map<string, SourcePage[]>();
  const missingDocs: string[] = [];

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const dir = path.join(packagesDir, slug);
    const pkgJsonFile = path.join(dir, "package.json");
    if (!existsSync(pkgJsonFile)) continue;
    const docsDir = path.join(dir, "docs");
    if (!existsSync(path.join(docsDir, "introduction.md"))) {
      missingDocs.push(slug);
      if (existsSync(docsDir)) {
        errors.push({
          file: toRepoPath(docsDir),
          message: "docs/ needs an introduction.md",
        });
      }
      continue;
    }

    const pkgJson = JSON.parse(readFileSync(pkgJsonFile, "utf8")) as {
      name: string;
      version: string;
      description?: string;
    };
    const nav = packageNav[slug];
    packages.push({
      slug,
      dir,
      name: pkgJson.name,
      label: nav?.label ?? pkgJson.name,
      group: groupOf(slug),
      version: pkgJson.version,
      description: pkgJson.description ?? "",
      path: `/docs/${slug}/introduction`,
      repoPath: toRepoPath(dir),
    });

    const pages = listMarkdown(docsDir, errors, ["assets", "api"])
      .map((file) => {
        const name = path.basename(file, ".md");
        if (name === "changelog") {
          errors.push({
            file: toRepoPath(file),
            message: "changelog is generated from CHANGELOG.md",
          });
        }
        return readPage(
          file,
          "package",
          `/docs/${slug}/${name}`,
          `${slug}/${name}`,
          slug,
          errors,
        );
      })
      .filter(keep);
    const intro = pages.filter((p) => p.path.endsWith("/introduction"));
    const rest = pages
      .filter((p) => !p.path.endsWith("/introduction"))
      .sort(byOrderThenLabel);
    const ordered = [...intro, ...rest];

    const changelogFile = path.join(dir, "CHANGELOG.md");
    if (existsSync(changelogFile)) {
      ordered.push(
        readPage(
          changelogFile,
          "changelog",
          `/docs/${slug}/changelog`,
          `${slug}/changelog`,
          slug,
          errors,
        ),
      );
    }
    packagePages.set(slug, ordered);
    assets.push(
      ...listAssets(
        path.join(docsDir, "assets"),
        `/docs/${slug}/assets`,
        errors,
      ),
    );
  }

  const groupRank = new Map(groups.map((g, i) => [g.id, i]));
  packages.sort(
    (a, b) =>
      (groupRank.get(a.group) ?? 0) - (groupRank.get(b.group) ?? 0) ||
      (packageNav[a.slug]?.order ?? 99) - (packageNav[b.slug]?.order ?? 99) ||
      a.name.localeCompare(b.name),
  );

  const pages = [
    ...guides,
    ...packages.flatMap((pkg) => packagePages.get(pkg.slug) ?? []),
  ];

  const packageSlugs = new Set(packages.map((p) => p.slug));
  for (const guide of guides) {
    if (packageSlugs.has(guide.id) || guide.id === "assets") {
      errors.push({
        file: guide.repoPath,
        message: `/docs/${guide.id} is taken by a package or folder`,
      });
    }
  }

  const redirects: Redirect[] = [
    { from: "/docs", to: site.docsHome },
    ...packages.map((pkg) => ({ from: `/docs/${pkg.slug}`, to: pkg.path })),
  ];
  if (!guides.some((g) => g.path === site.docsHome)) {
    errors.push({
      file: toRepoPath(guidesDir),
      message: `${site.docsHome} (site.docsHome) has no page`,
    });
  }

  return {
    pages,
    packages,
    assets,
    redirects,
    missingDocs,
    draftFiles,
    byFile: new Map(pages.map((p) => [p.file, p])),
    byPath: new Map(pages.map((p) => [p.path, p])),
    errors,
  };
}

// Every source file's path and mtime. The manifest is rebuilt only when it changes, so loaders
// can call getManifest() per request in dev and per page during prerender without reparsing.
function signature(): string {
  const parts: string[] = [];
  const add = (file: string) => {
    try {
      const s = statSync(file);
      parts.push(`${file}:${s.mtimeMs}:${s.size}`);
    } catch {
      // Missing is part of the signature too.
    }
  };
  const addDir = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) addDir(full);
      else add(full);
    }
  };
  addDir(guidesDir);
  for (const slug of readdirSync(packagesDir)) {
    const dir = path.join(packagesDir, slug);
    add(path.join(dir, "package.json"));
    add(path.join(dir, "CHANGELOG.md"));
    addDir(path.join(dir, "docs"));
  }
  return parts.join("\n");
}

let cached: { signature: string; manifest: Manifest } | undefined;

/** The manifest with any errors in `errors`; for tests and tools that report them. */
export function loadManifest(): Manifest {
  const sig = signature();
  if (cached?.signature !== sig) {
    cached = { signature: sig, manifest: buildManifest() };
  }
  return cached.manifest;
}

/** The manifest, throwing every content error at once; for routes and loaders. */
export function getManifest(): Manifest {
  const manifest = loadManifest();
  if (manifest.errors.length > 0)
    throw new ContentValidationError(manifest.errors);
  return manifest;
}

export function packageOf(
  manifest: Manifest,
  page: SourcePage,
): SourcePackage | undefined {
  return page.pkg
    ? manifest.packages.find((p) => p.slug === page.pkg)
    : undefined;
}

export function summarizePage(page: SourcePage): PageSummary {
  return {
    id: page.id,
    kind: page.kind,
    path: page.path,
    mdPath: page.mdPath,
    title: page.title,
    description: page.description,
    repoPath: page.repoPath,
  };
}

export function summarizePackage(pkg: SourcePackage): PackageSummary {
  const { slug, name, label, group, version, description, path, repoPath } =
    pkg;
  return { slug, name, label, group, version, description, path, repoPath };
}
