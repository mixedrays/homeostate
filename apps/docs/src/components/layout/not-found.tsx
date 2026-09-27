import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { site } from "@/site.config.ts";
import { SiteHeader } from "./site-header.tsx";

export function NotFound() {
  return (
    <>
      <SiteHeader />
      <main
        id="content"
        className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center"
      >
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mt-3 text-muted-foreground">
          The page moved or never existed. Search the docs, or start from the
          beginning.
        </p>
        <div className="mt-8 flex gap-3">
          <Button render={<Link to={site.docsHome} />}>Getting started</Button>
          <Button variant="outline" render={<a href="/llms.txt" />}>
            Index of every page
          </Button>
        </div>
      </main>
    </>
  );
}
