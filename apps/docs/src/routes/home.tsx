import { ArrowRightIcon } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { GithubIcon } from "@/components/layout/github-icon.tsx";
import { SiteHeader } from "@/components/layout/site-header.tsx";
import { Markdown } from "@/components/markdown/markdown.tsx";
import { Button } from "@/components/ui/button";
import { getManifest, summarizePackage } from "@/content/manifest.server.ts";
import { renderFragment } from "@/content/markdown.server.ts";
import type { PackageSummary } from "@/content/types.ts";
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

export const meta: Route.MetaFunction = () => {
  const title = `${site.name}: sync any store with any CRDT`;
  return [
    { title },
    { name: "description", content: site.summary },
    { tagName: "link", rel: "canonical", href: `${siteUrl}/` },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: site.summary },
    { property: "og:url", content: `${siteUrl}/` },
  ];
};

function PackageColumn({
  title,
  hint,
  packages,
}: {
  title: string;
  hint: string;
  packages: PackageSummary[];
}) {
  return (
    <section className="rounded-xl border p-5">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <ul className="mt-4 grid gap-1">
        {packages.map((pkg) => (
          <li key={pkg.slug}>
            <Link
              to={pkg.path}
              prefetch="intent"
              className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              <span>
                {pkg.label}{" "}
                <span className="ml-1 font-mono text-xs text-muted-foreground">
                  {pkg.name}
                </span>
              </span>
              <ArrowRightIcon className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
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
      <main id="content" className="mx-auto max-w-5xl px-4 sm:px-6">
        <section className="py-20 sm:py-28">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Keep the store you already use in sync with any CRDT
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
            {site.summary}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              render={<Link to={site.docsHome} prefetch="intent" />}
            >
              Get started <ArrowRightIcon />
            </Button>
            <Button size="lg" variant="outline" render={<a href={site.repo} />}>
              <GithubIcon className="size-4" /> GitHub
            </Button>
          </div>
          <div className="mt-10 max-w-2xl">
            <Markdown hast={install} />
          </div>
        </section>

        <section className="pb-24">
          <p className="mb-4 text-sm text-muted-foreground">
            Pick one of each.{" "}
            <Link
              to={byGroup("core")[0]?.path ?? site.docsHome}
              className="underline underline-offset-4"
            >
              @homeostate/core
            </Link>{" "}
            runs the sync between them.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <PackageColumn
              title="Store adapters"
              hint="For the state manager you use."
              packages={byGroup("store")}
            />
            <PackageColumn
              title="CRDT backends"
              hint="For the CRDT library that replicates."
              packages={byGroup("crdt")}
            />
          </div>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <span>MIT licensed</span>
          <a href="/llms.txt" className="hover:text-foreground">
            llms.txt
          </a>
          <a href="/llms-full.txt" className="hover:text-foreground">
            llms-full.txt
          </a>
          <a href={site.repo} className="hover:text-foreground">
            GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
