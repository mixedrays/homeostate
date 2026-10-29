import type { MetaDescriptor } from "react-router";
import { site } from "../site.config.ts";
import { siteUrl } from "./site-url.ts";

/** public/og.png, the preview image for every page shared on social sites and in chats. */
const OG_IMAGE = {
  path: "/og.png",
  width: 1200,
  height: 630,
  alt: `${site.name}: sync any store with any CRDT`,
};

/** Title, description, canonical URL and social preview tags for a page at `path`. */
export function pageMeta({
  type,
  title,
  description,
  path,
}: {
  type: "website" | "article";
  title: string;
  description: string;
  path: string;
}): MetaDescriptor[] {
  const url = `${siteUrl}${path}`;
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:type", content: type },
    { property: "og:site_name", content: site.name },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: `${siteUrl}${OG_IMAGE.path}` },
    { property: "og:image:width", content: String(OG_IMAGE.width) },
    { property: "og:image:height", content: String(OG_IMAGE.height) },
    { property: "og:image:alt", content: OG_IMAGE.alt },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

/** A schema.org BreadcrumbList for search results; every crumb is a path on this site. */
export function breadcrumbs(
  crumbs: { name: string; path: string }[],
): MetaDescriptor {
  return {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((crumb, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: crumb.name,
        item: `${siteUrl}${crumb.path}`,
      })),
    },
  };
}
