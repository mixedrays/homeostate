// Shapes shared by the build-time content code and the client components. Nothing here may
// import from a `.server.ts` module.

export type GroupId =
  "guides" | "core" | "crdt" | "store" | "persist" | "tools";

export type PageKind = "guide" | "package" | "changelog";

export interface TocEntry {
  depth: 2 | 3;
  id: string;
  text: string;
}

export interface NavLink {
  label: string;
  path: string;
}

export interface NavPackage {
  slug: string;
  name: string;
  label: string;
  links: NavLink[];
}

export interface NavSection {
  id: GroupId;
  title: string;
  /** Guides, or the pages of a section's only package. */
  links: NavLink[];
  /** Packages rendered as collapsible items; empty when `links` holds the only package. */
  packages: NavPackage[];
}

export interface PackageSummary {
  slug: string;
  name: string;
  label: string;
  group: GroupId;
  version: string;
  description: string;
  path: string;
  repoPath: string;
}

export interface PageSummary {
  id: string;
  kind: PageKind;
  path: string;
  mdPath: string;
  title: string;
  description: string;
  repoPath: string;
}
