import { cn } from "cn";
import { ArrowRightIcon } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { SyncDemo } from "@/components/home/sync-demo.tsx";
import { SyncDiagram } from "@/components/home/sync-diagram.tsx";
import { GithubIcon } from "@/components/layout/github-icon.tsx";
import { NpmIcon } from "@/components/layout/npm-icon.tsx";
import { SiteHeader } from "@/components/layout/site-header.tsx";
import { Markdown } from "@/components/markdown/markdown.tsx";
import { Button } from "@/components/ui/button";
import { docsPackage } from "@/content/docs-package.server.ts";
import { BENEFITS, INSTALL, QUICKSTART } from "@/content/landing.server.ts";
import { getManifest, summarizePackage } from "@/content/manifest.server.ts";
import { renderFragment } from "@/content/markdown.server.ts";
import type { PackageSummary } from "@/content/types.ts";
import { pageMeta } from "@/lib/meta.ts";
import { siteUrl } from "@/lib/site-url.ts";
import { groups, site, siteNav } from "@/site.config.ts";

export async function loader() {
  const manifest = getManifest();
  const docs = docsPackage();
  return {
    packages: manifest.packages.map(summarizePackage),
    benefits: BENEFITS,
    // As the About page's header shows it.
    docsVersion: `${docs.name}@${docs.version}`,
    quickstart: await renderFragment(
      `${INSTALL}\n\n${QUICKSTART}`,
      manifest,
      siteUrl,
    ),
  };
}

export const meta: Route.MetaFunction = () => [
  ...pageMeta({
    type: "website",
    title: `${site.name}: sync any store with any CRDT`,
    description: site.description,
    path: "/",
  }),
  // Gives search results the site's name instead of its domain.
  {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: site.name,
      url: `${siteUrl}/`,
      description: site.description,
    },
  },
];

/** A card of package links; side by side from `lg`, its rows grow to match the other card. */
function PackageColumn({
  title,
  hint,
  packages,
  columns = false,
}: {
  title: string;
  hint: string;
  packages: PackageSummary[];
  columns?: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border bg-background p-5 sm:p-6">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <ul className={cn("mt-6 grid flex-1 gap-2", columns && "sm:grid-cols-2")}>
        {packages.map((pkg) => (
          <li key={pkg.slug} className="min-w-0">
            <Link
              to={pkg.path}
              prefetch="intent"
              className="group flex h-full items-center justify-between gap-3 rounded-lg border border-transparent bg-muted/40 px-3 py-3 transition-colors hover:border-primary/25 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{pkg.label}</span>
                <span className="mt-1 block font-mono text-[11px] wrap-break-word text-muted-foreground">
                  {pkg.name}
                </span>
                {pkg.hint && (
                  <span className="mt-2 block text-xs leading-snug text-pretty text-muted-foreground">
                    {pkg.hint}
                  </span>
                )}
              </span>
              <ArrowRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Groups shown in the integrations section; the rest go in "More packages". */
const featuredGroups = new Set<PackageSummary["group"]>([
  "core",
  "store",
  "crdt",
]);

/** `to` links are site pages, `href` links are files or other sites. */
const footerColumns: {
  title: string;
  links: ({ label: string; to: string } | { label: string; href: string })[];
}[] = [
  { title: "Learn", links: [...siteNav] },
  {
    title: "Project",
    links: [
      { label: "About", to: site.aboutPage },
      { label: "GitHub", href: site.repo },
      { label: "npm", href: site.npmOrg },
    ],
  },
  {
    title: "For LLMs",
    links: [
      { label: "llms.txt", href: "/llms.txt" },
      { label: "llms-full.txt", href: "/llms-full.txt" },
    ],
  },
];

export default function Home({ loaderData }: Route.ComponentProps) {
  const { packages, benefits, docsVersion, quickstart } = loaderData;
  const byGroup = (group: PackageSummary["group"]) =>
    packages.filter((p) => p.group === group);
  const moreGroups = groups
    .filter((group) => !featuredGroups.has(group.id))
    .map((group) => ({ ...group, packages: byGroup(group.id) }))
    .filter((group) => group.packages.length > 0);

  return (
    <>
      <SiteHeader containerClassName="max-w-6xl" />
      <main id="content" className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Splits at xl: below ~1140px the demo's column is under its 26rem side-by-side width. */}
        <section
          aria-labelledby="hero-heading"
          className="grid items-center gap-12 pt-14 pb-12 sm:pt-20 lg:pt-24 xl:grid-cols-[1.2fr_1fr] xl:gap-16"
        >
          <div>
            <p className="mb-6 flex items-center gap-2 font-mono text-xs tracking-wider text-muted-foreground uppercase">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-primary"
              />
              Sync engine for JS stores
            </p>
            <h1
              id="hero-heading"
              className="text-4xl leading-[1.08] font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl"
            >
              Keep your store.
              <br />
              <span className="text-primary">Add CRDT sync.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-pretty text-muted-foreground">
              Homeostate syncs Zustand, Redux, MobX and other state managers
              with a Yjs, Loro or Automerge document, in both directions.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                render={<Link to={site.docsHome} prefetch="intent" />}
              >
                Get started <ArrowRightIcon aria-hidden="true" />
              </Button>
              <Button size="lg" variant="ghost" render={<a href={site.repo} />}>
                <GithubIcon className="size-4" /> View on GitHub
              </Button>
              <Button
                size="lg"
                variant="ghost"
                render={<a href={site.npmOrg} />}
              >
                <NpmIcon className="size-4" /> View on npm
              </Button>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              Open source · MIT licensed · Framework agnostic
            </p>
          </div>
          <SyncDemo />
        </section>

        <section
          aria-labelledby="quickstart-heading"
          className="grid gap-8 border-y py-12 sm:py-16 lg:grid-cols-[1fr_1.6fr] lg:gap-12"
        >
          <div>
            <p className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">
              Quick start
            </p>
            <h2
              id="quickstart-heading"
              className="text-3xl font-semibold tracking-tight"
            >
              Start with Zustand + Yjs
            </h2>
            <p className="mt-3 max-w-md text-pretty text-muted-foreground">
              Install the sync engine, the Zustand adapter, the Yjs backend and
              their dependencies, then wrap your state creator in{" "}
              <code className="font-mono text-[0.9em] text-foreground">
                homeostate
              </code>
              . The store works locally until the provider has the room's state,
              then syncs everything but its functions.
            </p>
            <Link
              to={site.docsHome}
              prefetch="intent"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              Read the getting-started guide{" "}
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
          {/* Drops the prose my-6 on code blocks; the grid spaces them. */}
          <div className="grid min-w-0 gap-4 [&>*]:my-0">
            <Markdown hast={quickstart} />
          </div>
        </section>

        <section
          aria-labelledby="integrations-heading"
          className="py-16 sm:py-20"
        >
          <div className="mb-8">
            <p className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">
              Integrations
            </p>
            <h2
              id="integrations-heading"
              className="text-3xl font-semibold tracking-tight"
            >
              Any store adapter works with any CRDT backend
            </h2>
            <p className="mt-3 max-w-xl text-pretty text-muted-foreground">
              Pick one of each. Homeostate handles the sync between them.
            </p>
          </div>
          <div className="grid gap-5">
            <SyncDiagram
              stores={byGroup("store").map((pkg) => pkg.label)}
              backends={byGroup("crdt").map((pkg) => pkg.label)}
              corePath={byGroup("core")[0]?.path ?? site.docsHome}
            />
            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <PackageColumn
                title="Store adapters"
                hint="One per state manager."
                packages={byGroup("store")}
                columns
              />
              <PackageColumn
                title="CRDT backends"
                hint="One per CRDT library."
                packages={byGroup("crdt")}
              />
            </div>
          </div>
        </section>

        {moreGroups.length > 0 && (
          <section aria-labelledby="more-heading" className="pb-16 sm:pb-20">
            <p className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">
              More packages
            </p>
            <h2
              id="more-heading"
              className="text-xl font-semibold tracking-tight"
            >
              Persistence, UI bindings and tools
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {moreGroups.map((group) => (
                <section
                  key={group.id}
                  aria-labelledby={`more-${group.id}-heading`}
                  className="min-w-0 rounded-2xl border p-5"
                >
                  <h3
                    id={`more-${group.id}-heading`}
                    className="text-sm font-semibold"
                  >
                    {group.title}
                  </h3>
                  <ul className="mt-3 grid gap-1">
                    {group.packages.map((pkg) => (
                      <li key={pkg.slug} className="min-w-0">
                        <Link
                          to={pkg.path}
                          prefetch="intent"
                          className="group -mx-2 flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <span className="min-w-0 text-sm">
                            <span className="font-medium">{pkg.label}</span>{" "}
                            <span className="font-mono text-[11px] wrap-break-word text-muted-foreground">
                              {pkg.name}
                            </span>
                          </span>
                          <ArrowRightIcon
                            aria-hidden="true"
                            className="size-3.5 shrink-0 self-center text-muted-foreground transition-colors group-hover:text-primary"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        )}

        <section
          aria-labelledby="why-heading"
          className="border-t py-16 sm:py-20"
        >
          <p className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">
            Why Homeostate
          </p>
          <h2
            id="why-heading"
            className="text-3xl font-semibold tracking-tight"
          >
            Less code to change, no conflicts to resolve
          </h2>
          <ul className="mt-8 grid gap-5 md:grid-cols-2">
            {benefits.map((benefit) => (
              <li
                key={benefit.title}
                className="flex flex-col rounded-2xl border bg-background p-5 sm:p-6"
              >
                <h3 className="font-semibold">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
                  {benefit.body}
                </p>
                <Link
                  to={benefit.link.to}
                  prefetch="intent"
                  className="mt-4 inline-flex items-center gap-2 self-start text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  {benefit.link.label}{" "}
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="guide-heading"
          className="mb-16 flex flex-wrap items-center justify-between gap-6 rounded-2xl border bg-muted/30 p-6 sm:mb-20 sm:p-8"
        >
          <div>
            <h2
              id="guide-heading"
              className="text-xl font-semibold tracking-tight"
            >
              Try it in two browser tabs
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-pretty text-muted-foreground">
              The guide builds a React counter with a local sync server, so an
              increment in one tab shows up in the other. The concepts page
              explains how the engine, store adapters and CRDT backends fit
              together.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              render={<Link to={site.docsHome} prefetch="intent" />}
            >
              Follow the guide <ArrowRightIcon aria-hidden="true" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link to={site.conceptsPage} prefetch="intent" />}
            >
              Read the concepts
            </Button>
          </div>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1fr_auto] md:gap-16">
          <div>
            <p className="font-medium">{site.name}</p>
            <p className="mt-2 text-muted-foreground">MIT licensed</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {docsVersion}
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3"
          >
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h2 className="font-medium">{column.title}</h2>
                <ul className="mt-3 grid gap-2 text-muted-foreground">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {"to" in link ? (
                        <Link
                          to={link.to}
                          prefetch="intent"
                          className="hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        <a href={link.href} className="hover:text-foreground">
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </footer>
    </>
  );
}
