import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { site } from "@/site.config.ts";
import { GithubIcon } from "./github-icon.tsx";
import { SearchDialog } from "./search-dialog.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

export function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 font-semibold tracking-tight"
    >
      <img
        src="/homeostate.svg"
        alt=""
        width={28}
        height={28}
        className="dark:hidden"
      />
      <img
        src="/homeostate-dark.svg"
        alt=""
        width={28}
        height={28}
        className="hidden dark:block"
      />
      {site.name}
    </Link>
  );
}

export function SiteHeader({ start }: { start?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-2 px-4 sm:px-6">
        {start}
        <Logo />
        <nav
          aria-label="Site"
          className="ml-6 hidden items-center gap-5 text-sm text-muted-foreground md:flex"
        >
          <Link
            to={site.docsHome}
            className="transition-colors hover:text-foreground"
          >
            Docs
          </Link>
          <a
            href="/llms.txt"
            className="transition-colors hover:text-foreground"
          >
            llms.txt
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <SearchDialog />
          <Button
            variant="ghost"
            size="icon"
            render={<a href={site.repo} aria-label="GitHub repository" />}
          >
            <GithubIcon className="size-4" />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
