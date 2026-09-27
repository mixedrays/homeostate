import { PencilIcon } from "lucide-react";
import type { Route } from "./+types/doc-page";
import { MobileToc, Toc } from "@/components/layout/toc.tsx";
import { PageActions } from "@/components/layout/page-actions.tsx";
import { PrevNext } from "@/components/layout/prev-next.tsx";
import { Markdown } from "@/components/markdown/markdown.tsx";
import { Badge } from "@/components/ui/badge";
import {
  getManifest,
  packageOf,
  summarizePackage,
  summarizePage,
} from "@/content/manifest.server.ts";
import { docsPackage } from "@/content/docs-package.server.ts";
import { renderPage } from "@/content/markdown.server.ts";
import { neighbours } from "@/content/nav.server.ts";
import { notFound, requestPath } from "@/content/respond.server.ts";
import { siteUrl } from "@/lib/site-url.ts";
import { site } from "@/site.config.ts";

export async function loader({ request }: Route.LoaderArgs) {
  const manifest = getManifest();
  const page = manifest.byPath.get(requestPath(request));
  if (!page) notFound();
  const pkg = packageOf(manifest, page);
  const { hast, toc } = await renderPage(page, manifest, siteUrl);
  return {
    page: summarizePage(page),
    pkg: pkg && summarizePackage(pkg),
    strip: infoStrip(page.path, pkg),
    hast,
    toc,
    ...neighbours(manifest, page),
  };
}

interface InfoStripData {
  badge: string;
  links: { label: string; href: string }[];
}

// Package pages show the package's published version; the About page shows the docs app's own.
function infoStrip(
  pathname: string,
  pkg: ReturnType<typeof packageOf>,
): InfoStripData | undefined {
  if (pkg) {
    return {
      badge: `${pkg.name}@${pkg.version}`,
      links: [
        { label: "npm", href: `${site.npm}/${pkg.name}` },
        {
          label: "Source",
          href: `${site.repo}/tree/${site.branch}/${pkg.repoPath}`,
        },
      ],
    };
  }
  if (pathname === site.aboutPage) {
    const docs = docsPackage();
    return {
      badge: `${docs.name}@${docs.version}`,
      links: [
        { label: "GitHub", href: site.repo },
        { label: "npm", href: site.npmOrg },
      ],
    };
  }
  return undefined;
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const { page, pkg } = loaderData;
  const title = [
    page.title,
    pkg && page.title !== pkg.name ? pkg.name : undefined,
    site.name,
  ]
    .filter(Boolean)
    .join(" · ");
  const url = `${siteUrl}${page.path}`;
  return [
    { title },
    { name: "description", content: page.description },
    { tagName: "link", rel: "canonical", href: url },
    {
      tagName: "link",
      rel: "alternate",
      type: "text/markdown",
      href: page.mdPath,
    },
    { property: "og:type", content: "article" },
    { property: "og:site_name", content: site.name },
    { property: "og:title", content: title },
    { property: "og:description", content: page.description },
    { property: "og:url", content: url },
    { name: "twitter:card", content: "summary" },
  ];
};

function InfoStrip({ strip }: { strip: InfoStripData }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <Badge variant="secondary" className="font-mono">
        {strip.badge}
      </Badge>
      {strip.links.map((link) => (
        <a key={link.label} href={link.href} className="hover:text-foreground">
          {link.label}
        </a>
      ))}
    </div>
  );
}

export default function DocPage({ loaderData }: Route.ComponentProps) {
  const { page, pkg, strip, hast, toc, prev, next } = loaderData;
  const section = pkg ? `${pkg.label}` : "Guides";

  return (
    <div className="flex justify-center gap-10">
      <article className="w-full max-w-3xl min-w-0 py-8 lg:px-8">
        <header className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{section}</p>
            <PageActions mdPath={page.mdPath} />
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance break-words">
            {page.title}
          </h1>
          <p className="mt-3 text-lg text-pretty text-muted-foreground">
            {page.description}
          </p>
          {strip && <InfoStrip strip={strip} />}
        </header>
        <MobileToc toc={toc} />
        <div className="prose prose-docs max-w-none prose-headings:scroll-mt-20 prose-headings:font-semibold prose-headings:tracking-tight">
          <Markdown hast={hast} />
        </div>
        <footer className="mt-14 flex flex-col gap-8 border-t pt-6">
          {page.kind !== "changelog" && (
            <a
              href={`${site.repo}/edit/${site.branch}/${page.repoPath}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <PencilIcon className="size-3.5" />
              Edit this page on GitHub
            </a>
          )}
          <PrevNext prev={prev} next={next} />
        </footer>
      </article>
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 xl:block">
        <Toc toc={toc} />
      </aside>
    </div>
  );
}
