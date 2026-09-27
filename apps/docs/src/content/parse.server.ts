import GithubSlugger from "github-slugger";
import type { Heading, Root } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .freeze();

export interface ContentError {
  /** Repo-relative path. */
  file: string;
  line?: number;
  message: string;
}

export class ContentValidationError extends Error {
  readonly errors: ContentError[];

  constructor(errors: ContentError[]) {
    super(`Docs content is invalid:\n${formatErrors(errors)}`);
    this.name = "ContentValidationError";
    this.errors = errors;
  }
}

export function formatErrors(errors: ContentError[]): string {
  return errors
    .map((e) => `  ${e.file}${e.line ? `:${e.line}` : ""}: ${e.message}`)
    .join("\n");
}

export function parseMarkdown(source: string): Root {
  return parser.parse(source);
}

/** The YAML frontmatter block, if the file starts with one, and the offset where the body starts. */
export function splitFrontmatter(
  tree: Root,
  source: string,
): { yaml?: string; bodyStart: number } {
  const first = tree.children[0];
  if (first?.type !== "yaml") return { bodyStart: 0 };
  let bodyStart = first.position?.end.offset ?? 0;
  while (source[bodyStart] === "\n" || source[bodyStart] === "\r") bodyStart++;
  return { yaml: first.value, bodyStart };
}

/**
 * Heading ids exactly as GitHub assigns them, in document order, so `#anchor` links behave the
 * same on GitHub and on the site.
 */
export function headingIds(tree: Root): Map<Heading, string> {
  const slugger = new GithubSlugger();
  const ids = new Map<Heading, string>();
  visit(tree, "heading", (node) => {
    ids.set(node, slugger.slug(toString(node)));
  });
  return ids;
}

/** The H1 that must open every page, after the frontmatter. */
export function leadingTitle(tree: Root): Heading | undefined {
  const first = tree.children.find((node) => node.type !== "yaml");
  return first?.type === "heading" && first.depth === 1 ? first : undefined;
}
