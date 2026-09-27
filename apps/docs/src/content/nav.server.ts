import { groups } from "../site.config.ts";
import {
  packageOf,
  type Manifest,
  type SourcePage,
} from "./manifest.server.ts";
import type { NavLink, NavSection } from "./types.ts";

function link(page: SourcePage): NavLink {
  return { label: page.label, path: page.path };
}

/** Sidebar sections; a section with one package lists its pages directly. */
export function buildNav(manifest: Manifest): NavSection[] {
  return groups.flatMap((group): NavSection[] => {
    if (group.id === "guides") {
      const links = manifest.pages.filter((p) => p.kind === "guide").map(link);
      return links.length > 0 ? [{ ...group, links, packages: [] }] : [];
    }
    const packages = manifest.packages
      .filter((pkg) => pkg.group === group.id)
      .map((pkg) => ({
        slug: pkg.slug,
        name: pkg.name,
        label: pkg.label,
        links: manifest.pages.filter((p) => p.pkg === pkg.slug).map(link),
      }));
    if (packages.length === 0) return [];
    if (packages.length === 1)
      return [{ ...group, links: packages[0].links, packages: [] }];
    return [{ ...group, links: [], packages }];
  });
}

/** The pages before and after, in sidebar order, labelled with their package ("Yjs: Changelog"). */
export function neighbours(manifest: Manifest, page: SourcePage) {
  const index = manifest.pages.indexOf(page);
  const labelled = (target: SourcePage | undefined): NavLink | undefined => {
    if (!target) return undefined;
    const pkg = packageOf(manifest, target);
    return {
      label: pkg ? `${pkg.label}: ${target.label}` : target.label,
      path: target.path,
    };
  };
  return {
    prev: labelled(manifest.pages[index - 1]),
    next: labelled(manifest.pages[index + 1]),
  };
}
