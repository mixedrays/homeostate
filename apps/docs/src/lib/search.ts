import type { Options, SearchOptions } from "minisearch";

/** One h2/h3 section of a page (or the page's intro, before its first h2). */
export interface SearchDoc {
  id: string;
  /** URL with the section's anchor. */
  path: string;
  page: string;
  heading: string;
  /** "Guides" or the package label, shown with the result. */
  section: string;
  text: string;
}

export type SearchResultDoc = Pick<
  SearchDoc,
  "id" | "path" | "page" | "heading" | "section"
>;

// MiniSearch.loadJSON needs the same fields and storeFields the index was built with, so the
// build (search-index.json) and the dialog both read them from here.
export const searchSearchOptions: SearchOptions = {
  boost: { heading: 2, page: 1.5 },
  prefix: true,
  fuzzy: 0.2,
};

export const searchIndexOptions: Options<SearchDoc> = {
  fields: ["page", "heading", "text"],
  storeFields: ["path", "page", "heading", "section"],
  searchOptions: searchSearchOptions,
};
