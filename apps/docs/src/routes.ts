import {
  index,
  layout,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";
import { getManifest } from "./content/manifest.server.ts";

// Every route is static and generated from the content manifest. React Router has no partial
// segments, so `docs/:pkg/:page` would also match `introduction.md`; with static paths the .md
// twins get their own routes, and `prerender: true` renders all of them without a path list.
// Adding or removing a page restarts the dev server (scripts/docs-dev.ts) to regenerate this.
const manifest = getManifest();

export default [
  index("routes/home.tsx"),
  layout(
    "routes/docs-layout.tsx",
    manifest.pages.map((page) =>
      route(page.path.slice(1), "routes/doc-page.tsx", {
        id: `page:${page.id}`,
      }),
    ),
  ),
  ...manifest.pages.map((page) =>
    route(page.mdPath.slice(1), "routes/doc-md.ts", { id: `md:${page.id}` }),
  ),
  ...manifest.redirects.map((r) =>
    route(r.from.slice(1), "routes/redirect.tsx", { id: `redirect:${r.from}` }),
  ),
  ...manifest.packages.flatMap((pkg) => [
    route(`docs/${pkg.slug}/llms.txt`, "routes/llms.ts", {
      id: `llms:${pkg.slug}`,
    }),
    route(`docs/${pkg.slug}/llms-full.txt`, "routes/llms-full.ts", {
      id: `llms-full:${pkg.slug}`,
    }),
  ]),
  ...manifest.assets.map((asset) =>
    route(asset.path.slice(1), "routes/asset.ts", {
      id: `asset:${asset.path}`,
    }),
  ),
  route("llms.txt", "routes/llms.ts", { id: "llms" }),
  route("llms-full.txt", "routes/llms-full.ts", { id: "llms-full" }),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("robots.txt", "routes/robots.ts"),
  route("search-index.json", "routes/search-index.ts"),
] satisfies RouteConfig;
