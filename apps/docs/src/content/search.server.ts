import { readFileSync } from "node:fs";
import type { RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import MiniSearch from "minisearch";
import { searchIndexOptions, type SearchDoc } from "../lib/search.ts";
import { packageOf, type Manifest } from "./manifest.server.ts";
import { headingIds, leadingTitle, parseMarkdown } from "./parse.server.ts";

const MAX_SECTION_TEXT = 4000;

/** Splits every page except changelogs into h2/h3 sections. */
export function searchDocs(manifest: Manifest): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const page of manifest.pages) {
    if (page.kind === "changelog") continue;
    const tree = parseMarkdown(readFileSync(page.file, "utf8"));
    const ids = headingIds(tree);
    const title = leadingTitle(tree);
    const section = packageOf(manifest, page)?.label ?? "Guides";

    let current = {
      heading: page.title,
      anchor: "",
      parts: [page.description],
    };
    const flush = () => {
      const text = current.parts
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_SECTION_TEXT);
      const path = current.anchor
        ? `${page.path}#${current.anchor}`
        : page.path;
      docs.push({
        id: path,
        path,
        page: page.title,
        heading: current.heading,
        section,
        text,
      });
    };

    for (const node of tree.children as RootContent[]) {
      if (node.type === "yaml" || node === title) continue;
      if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
        flush();
        current = {
          heading: toString(node),
          anchor: ids.get(node) ?? "",
          parts: [],
        };
      } else {
        current.parts.push(toString(node));
      }
    }
    flush();
  }
  return docs;
}

export function searchIndexJson(manifest: Manifest): string {
  const index = new MiniSearch<SearchDoc>(searchIndexOptions);
  index.addAll(searchDocs(manifest));
  return JSON.stringify(index);
}
