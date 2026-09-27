import { readFileSync } from "node:fs";
import path from "node:path";
import { transformerMetaHighlight } from "@shikijs/transformers";
import type { Root as HastRoot } from "hast";
import type { Blockquote, Code, Parent, Root, RootContent } from "mdast";
import { toHast } from "mdast-util-to-hast";
import { toString } from "mdast-util-to-string";
import {
  createHighlighter,
  type Highlighter,
  type ShikiTransformer,
} from "shiki";
import { visit } from "unist-util-visit";
import type { PackageManager } from "../lib/package-manager.ts";
import type { Manifest, SourcePage } from "./manifest.server.ts";
import { resolveTreeUrls, type LinkContext } from "./links.server.ts";
import { guidesDir } from "./paths.server.ts";
import {
  ContentValidationError,
  headingIds,
  leadingTitle,
  parseMarkdown,
  type ContentError,
} from "./parse.server.ts";
import type { TocEntry } from "./types.ts";

/** Fence languages a page may use; anything else is an error so typos don't render as plain text. */
export const LANGUAGES = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "bash",
  "sh",
  "diff",
  "yaml",
  "md",
  "text",
];

const GRAMMARS = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "shellscript",
  "diff",
  "yaml",
  "markdown",
];

const THEMES = { light: "github-light", dark: "github-dark" } as const;

const ALERT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i;

export interface RenderResult {
  hast: HastRoot;
  toc: TocEntry[];
  errors: ContentError[];
}

let highlighter: Promise<Highlighter> | undefined;

function getHighlighter() {
  highlighter ??= createHighlighter({
    themes: Object.values(THEMES),
    langs: GRAMMARS,
  });
  return highlighter;
}

interface CodeMeta {
  title?: string;
  tab?: string;
  install: boolean;
  unknown: string[];
}

export function parseCodeMeta(meta: string | null | undefined): CodeMeta {
  const result: CodeMeta = { install: false, unknown: [] };
  if (!meta) return result;
  const token = /(\w+)=(?:"([^"]*)"|'([^']*)')|\{[^}]*\}|\S+/g;
  for (const match of meta.matchAll(token)) {
    const [whole, key, double, single] = match;
    const value = double ?? single;
    if (key === "title") result.title = value;
    else if (key === "tab") result.tab = value;
    else if (whole === "install") result.install = true;
    else if (/^\{[\d,\s-]*\}$/.test(whole))
      continue; // line highlights, read by transformerMetaHighlight
    else result.unknown.push(whole);
  }
  return result;
}

/** The same install as `npm install …`, for each package manager; undefined if it isn't one. */
export function installCommands(
  line: string,
): Record<PackageManager, string> | undefined {
  const match = /^npm (?:install|i|add)\s+(.+)$/.exec(line.trim());
  if (!match) return undefined;
  let dev = false;
  const packages: string[] = [];
  for (const arg of match[1].split(/\s+/)) {
    if (arg === "-D" || arg === "--save-dev") dev = true;
    else if (arg.startsWith("-")) return undefined;
    else packages.push(arg);
  }
  if (packages.length === 0) return undefined;
  const list = packages.join(" ");
  return {
    npm: `npm install ${dev ? "-D " : ""}${list}`,
    pnpm: `pnpm add ${dev ? "-D " : ""}${list}`,
    yarn: `yarn add ${dev ? "-D " : ""}${list}`,
    bun: `bun add ${dev ? "-d " : ""}${list}`,
  };
}

// Shiki's diff grammar colors the tokens; this marks whole lines so they get a background.
const diffLines: ShikiTransformer = {
  name: "docs:diff-lines",
  line(node, line) {
    const text = this.source.split("\n")[line - 1] ?? "";
    if (text.startsWith("+")) this.addClassToHast(node, ["diff", "add"]);
    else if (text.startsWith("-"))
      this.addClassToHast(node, ["diff", "remove"]);
  },
};

function lint(tree: Root, file: string): ContentError[] {
  const errors: ContentError[] = [];
  const title = leadingTitle(tree);
  visit(tree, (node) => {
    const line = node.position?.start.line;
    if (node.type === "html") {
      errors.push({
        file,
        line,
        message: "raw HTML is not allowed; use markdown",
      });
    } else if (node.type === "heading" && node.depth === 1 && node !== title) {
      errors.push({ file, line, message: "only the first line may be an H1" });
    } else if (node.type === "code") {
      const lang = node.lang ?? "text";
      if (!LANGUAGES.includes(lang)) {
        errors.push({
          file,
          line,
          message: `code language "${lang}" is not one of ${LANGUAGES.join(", ")}`,
        });
      }
      if (/\[!code\b/.test(node.value)) {
        errors.push({
          file,
          line,
          message: "shiki [!code] comments show up in the .md; use {1,3} meta",
        });
      }
      const meta = parseCodeMeta(node.meta);
      if (meta.unknown.length > 0) {
        errors.push({
          file,
          line,
          message: `unknown code meta: ${meta.unknown.join(" ")}`,
        });
      }
      if (meta.install && !installCommands(node.value)) {
        errors.push({
          file,
          line,
          message:
            "an install fence holds exactly one `npm install <packages>` line",
        });
      }
    }
  });
  return errors;
}

function transformAlerts(tree: Root) {
  visit(tree, "blockquote", (node: Blockquote) => {
    const first = node.children[0];
    if (first?.type !== "paragraph") return;
    const text = first.children[0];
    if (text?.type !== "text") return;
    const match = ALERT.exec(text.value);
    if (!match) return;
    text.value = text.value.slice(match[0].length);
    if (text.value === "") first.children.shift();
    if (first.children[0]?.type === "break") first.children.shift();
    if (first.children.length === 0) node.children.shift();
    node.data = {
      hName: "docs-alert",
      hProperties: { kind: match[1].toLowerCase() },
    };
  });
}

function transformHeadings(tree: Root): TocEntry[] {
  const toc: TocEntry[] = [];
  for (const [heading, id] of headingIds(tree)) {
    heading.data = {
      ...heading.data,
      hProperties: { ...heading.data?.hProperties, id },
    };
    if (heading.depth === 2 || heading.depth === 3) {
      toc.push({ depth: heading.depth, id, text: toString(heading) });
    }
  }
  return toc;
}

function codeElement(
  code: Code,
  shiki: Highlighter,
  tab?: string,
): RootContent {
  // An unknown language is already a lint error; render it as text so every error is reported.
  const lang = code.lang && LANGUAGES.includes(code.lang) ? code.lang : "text";
  const meta = parseCodeMeta(code.meta);
  const html = shiki.codeToHtml(code.value, {
    lang,
    themes: THEMES,
    defaultColor: false,
    meta: { __raw: code.meta ?? "" },
    transformers: [
      transformerMetaHighlight(),
      ...(lang === "diff" ? [diffLines] : []),
    ],
  });
  // Shiki's HTML is passed as one string rather than as hast: a token per span as JSON is about
  // twice the size in the .data payload, and the block is never edited on the client.
  return {
    type: "docsCode",
    data: {
      hName: "docs-code",
      hProperties: {
        language: lang,
        title: meta.title,
        tab: tab ?? meta.tab,
        html,
      },
      hChildren: [],
    },
  } as unknown as RootContent;
}

function codeGroup(
  variant: "install" | "tabs",
  children: RootContent[],
): RootContent {
  return {
    type: "docsCodeGroup",
    data: { hName: "docs-code-group", hProperties: { variant } },
    children,
  } as unknown as RootContent;
}

/**
 * Replaces code fences with highlighted blocks: an `install` fence becomes one tab per package
 * manager, and consecutive fences with `tab="…"` become one tab group.
 */
function transformCode(
  tree: Root,
  shiki: Highlighter,
  file: string,
  errors: ContentError[],
) {
  visit(tree, (node) => {
    if (!("children" in node)) return;
    const parent = node as Parent;
    if (!parent.children.some((child) => child.type === "code")) return;

    const next: RootContent[] = [];
    let tabs: Code[] = [];
    const flushTabs = () => {
      if (tabs.length === 1) {
        errors.push({
          file,
          line: tabs[0].position?.start.line,
          message: 'tab="…" needs at least two consecutive fences',
        });
      }
      if (tabs.length > 0)
        next.push(
          codeGroup(
            "tabs",
            tabs.map((code) => codeElement(code, shiki)),
          ),
        );
      tabs = [];
    };

    for (const child of parent.children) {
      if (child.type !== "code") {
        flushTabs();
        next.push(child as RootContent);
        continue;
      }
      const meta = parseCodeMeta(child.meta);
      if (meta.tab) {
        tabs.push(child);
        continue;
      }
      flushTabs();
      const commands = meta.install ? installCommands(child.value) : undefined;
      if (commands) {
        next.push(
          codeGroup(
            "install",
            Object.entries(commands).map(([pm, command]) =>
              codeElement({ ...child, value: command, meta: null }, shiki, pm),
            ),
          ),
        );
      } else {
        next.push(codeElement(child, shiki));
      }
    }
    flushTabs();
    parent.children = next as Parent["children"];
  });
}

function stripPositions(tree: HastRoot) {
  visit(tree, (node) => {
    delete node.position;
  });
}

export async function renderMarkdown(
  source: string,
  ctx: LinkContext,
): Promise<RenderResult> {
  const file = ctx.page.repoPath;
  const tree = parseMarkdown(source);
  const errors = lint(tree, file);

  const { occurrences, errors: linkErrors } = resolveTreeUrls(tree, ctx);
  errors.push(...linkErrors);
  for (const { node, resolved } of occurrences) node.url = resolved.html;

  const toc = transformHeadings(tree);
  transformAlerts(tree);
  transformCode(tree, await getHighlighter(), file, errors);

  // The page header renders the title and the frontmatter is metadata, so neither is body.
  const title = leadingTitle(tree);
  tree.children = tree.children.filter(
    (node) => node !== title && node.type !== "yaml",
  );

  const hast = toHast(tree) as HastRoot;
  stripPositions(hast);
  return { hast, toc, errors };
}

const renderCache = new Map<
  string,
  { manifest: Manifest; origin: string; result: RenderResult }
>();

/**
 * Renders a page, throwing its content errors. Cached until the manifest changes, which it does
 * whenever any source file does, since links and anchors in other pages decide the output too.
 */
export async function renderPage(
  page: SourcePage,
  manifest: Manifest,
  origin: string,
) {
  const hit = renderCache.get(page.file);
  if (hit && hit.manifest === manifest && hit.origin === origin)
    return hit.result;
  const result = await renderMarkdown(readFileSync(page.file, "utf8"), {
    page,
    manifest,
    origin,
  });
  if (result.errors.length > 0) throw new ContentValidationError(result.errors);
  renderCache.set(page.file, { manifest, origin, result });
  return result;
}

/** Markdown that isn't a page, such as the landing page's install block; links resolve from content/. */
export async function renderFragment(
  source: string,
  manifest: Manifest,
  origin: string,
) {
  const page: SourcePage = {
    id: "fragment",
    kind: "guide",
    file: path.join(guidesDir, "fragment.md"),
    repoPath: "apps/docs/src (fragment)",
    path: "/",
    mdPath: "/index.md",
    title: "",
    label: "",
    description: "",
    draft: false,
    anchors: new Set(),
  };
  const result = await renderMarkdown(source, { page, manifest, origin });
  if (result.errors.length > 0) throw new ContentValidationError(result.errors);
  return result.hast;
}
