import { cn } from "cn";
import {
  ArrowDownUpIcon,
  ArrowRightIcon,
  DatabaseIcon,
  LayersIcon,
  NetworkIcon,
} from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { GithubIcon } from "@/components/layout/github-icon.tsx";
import { NpmIcon } from "@/components/layout/npm-icon.tsx";
import { SiteHeader } from "@/components/layout/site-header.tsx";
import { Markdown } from "@/components/markdown/markdown.tsx";
import { Button } from "@/components/ui/button";
import { getManifest, summarizePackage } from "@/content/manifest.server.ts";
import { renderFragment } from "@/content/markdown.server.ts";
import type { PackageSummary } from "@/content/types.ts";
import { pageMeta } from "@/lib/meta.ts";
import { siteUrl } from "@/lib/site-url.ts";
import { site } from "@/site.config.ts";

const INSTALL =
  "```bash install\nnpm install @homeostate/core @homeostate/store-zustand @homeostate/crdt-yjs\n```";

export async function loader() {
  const manifest = getManifest();
  return {
    packages: manifest.packages.map(summarizePackage),
    install: await renderFragment(INSTALL, manifest, siteUrl),
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

const orList = new Intl.ListFormat("en", { type: "disjunction" });

function SyncDiagram({ backends }: { backends: string[] }) {
  return (
    <figure className="relative overflow-hidden rounded-2xl border bg-muted/30 p-6 sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[18px_18px] mask-[linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative">
        <div className="mb-7 flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-muted-foreground uppercase">
            How it connects
          </span>
          <span className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
            Two-way sync
          </span>
        </div>
        <div className="flex items-center gap-4 rounded-xl border bg-background p-4 shadow-xs">
          <LayersIcon
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
          <div>
            <p className="text-sm font-medium">Your existing store</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Same state. Same actions. Same UI.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 py-3 text-muted-foreground">
          <ArrowDownUpIcon aria-hidden="true" className="size-4" />
          <span className="font-mono text-[11px]">store adapter</span>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-primary/30 bg-background p-5 shadow-[0_4px_24px_-8px_var(--primary)]">
          <NetworkIcon aria-hidden="true" className="size-6 text-primary" />
          <div>
            <p className="font-semibold tracking-tight">Homeostate</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The sync engine between them.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 py-3 text-muted-foreground">
          <ArrowDownUpIcon aria-hidden="true" className="size-4" />
          <span className="font-mono text-[11px]">CRDT backend</span>
        </div>
        <div className="flex items-center gap-4 rounded-xl border bg-background p-4 shadow-xs">
          <DatabaseIcon
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
          <div>
            <p className="text-sm font-medium">Your CRDT document</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {orList.format(backends)}
            </p>
          </div>
        </div>
        <figcaption className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Local changes flow out. Remote changes flow in.
        </figcaption>
      </div>
    </figure>
  );
}

function PackageColumn({
  title,
  hint,
  step,
  packages,
  columns = false,
}: {
  title: string;
  hint: string;
  step: string;
  packages: PackageSummary[];
  columns?: boolean;
}) {
  return (
    <section className="min-w-0 rounded-2xl border bg-background p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/40 font-mono text-xs text-muted-foreground">
          {step}
        </span>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      <ul className={cn("mt-6 grid gap-2", columns && "sm:grid-cols-2")}>
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

export default function Home({ loaderData }: Route.ComponentProps) {
  const { packages, install } = loaderData;
  const byGroup = (group: PackageSummary["group"]) =>
    packages.filter((p) => p.group === group);

  return (
    <>
      <SiteHeader />
      <main id="content" className="mx-auto max-w-6xl px-4 sm:px-6">
        <section
          aria-labelledby="hero-heading"
          className="grid items-center gap-12 pt-14 pb-12 sm:pt-20 lg:grid-cols-[1.2fr_1fr] lg:gap-16 lg:pt-24"
        >
          <div>
            <p className="mb-6 flex items-center gap-2 font-mono text-xs tracking-wider text-muted-foreground uppercase">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-primary"
              />
              Your state. In sync.
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
              Connect the state manager you already use to the CRDT you choose.
              Homeostate keeps them in sync, so you can keep building your app.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                render={<Link to={site.docsHome} prefetch="intent" />}
              >
                Get started <ArrowRightIcon aria-hidden="true" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                render={<a href={site.repo} />}
              >
                <GithubIcon className="size-4" /> View on GitHub
              </Button>
              <Button
                size="lg"
                variant="outline"
                render={<a href={site.npmOrg} />}
              >
                <NpmIcon className="size-4" /> View on npm
              </Button>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              Open source · MIT licensed · Framework agnostic
            </p>
          </div>
          <SyncDiagram backends={byGroup("crdt").map((pkg) => pkg.label)} />
        </section>

        <section
          aria-labelledby="install-heading"
          className="grid items-center gap-x-8 border-y py-6 lg:grid-cols-[1fr_2fr]"
        >
          <div>
            <h2 id="install-heading" className="text-sm font-medium">
              Start with Zustand + Yjs
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One engine, one adapter, one backend.
            </p>
          </div>
          {/* Tightens the my-6 on CodeGroup's root, which is spaced for prose. */}
          <div className="min-w-0 [&>div]:my-3">
            <Markdown hast={install} />
          </div>
        </section>

        <section
          aria-labelledby="integrations-heading"
          className="py-16 sm:py-20"
        >
          <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">
                Built for your stack
              </p>
              <h2
                id="integrations-heading"
                className="text-3xl font-semibold tracking-tight"
              >
                Your tools. Connected.
              </h2>
              <p className="mt-3 max-w-xl text-pretty text-muted-foreground">
                Pick a store adapter and a CRDT backend. Homeostate handles the
                sync between them.
              </p>
            </div>
            <Link
              to={byGroup("core")[0]?.path ?? site.docsHome}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              Explore the sync engine{" "}
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <PackageColumn
              step="01"
              title="Store adapters"
              hint="Keep the state manager you know."
              packages={byGroup("store")}
              columns
            />
            <PackageColumn
              step="02"
              title="CRDT backends"
              hint="Choose how your state replicates."
              packages={byGroup("crdt")}
            />
          </div>
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
              From local state to shared state.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Build a synced counter with the getting-started guide, then
              connect your own app.
            </p>
          </div>
          <Button
            size="lg"
            render={<Link to={site.docsHome} prefetch="intent" />}
          >
            Follow the guide <ArrowRightIcon aria-hidden="true" />
          </Button>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-4 py-8 text-sm sm:px-6">
          <p className="font-medium">
            Homeostate{" "}
            <span className="ml-2 font-normal text-muted-foreground">
              MIT licensed
            </span>
          </p>
          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-x-5 gap-y-3 text-muted-foreground"
          >
            <a href="/llms.txt" className="hover:text-foreground">
              llms.txt
            </a>
            <a href="/llms-full.txt" className="hover:text-foreground">
              llms-full.txt
            </a>
            <a href={site.repo} className="hover:text-foreground">
              GitHub
            </a>
            <a href={site.npmOrg} className="hover:text-foreground">
              npm
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}
