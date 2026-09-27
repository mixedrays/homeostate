import { Outlet } from "react-router";
import type { Route } from "./+types/docs-layout";
import { MobileNav } from "@/components/layout/mobile-nav.tsx";
import { Sidebar } from "@/components/layout/sidebar.tsx";
import { SiteHeader } from "@/components/layout/site-header.tsx";
import { getManifest } from "@/content/manifest.server.ts";
import { buildNav } from "@/content/nav.server.ts";

export function loader() {
  return { nav: buildNav(getManifest()) };
}

export default function DocsLayout({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <SiteHeader start={<MobileNav nav={loaderData.nav} />} />
      <div className="mx-auto flex max-w-screen-2xl px-4 sm:px-6">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r py-8 pr-4 lg:block">
          <Sidebar nav={loaderData.nav} />
        </aside>
        <main id="content" className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </>
  );
}
