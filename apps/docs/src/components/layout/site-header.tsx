import { cn } from "cn";
import { MenuIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { site, siteNav } from "@/site.config.ts";
import { GithubIcon } from "./github-icon.tsx";
import { HomeostateMark } from "./homeostate-mark.tsx";
import { NpmIcon } from "./npm-icon.tsx";
import { SearchDialog } from "./search-dialog.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

export function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 font-semibold tracking-tight"
    >
      <HomeostateMark className="size-8" />
      {site.name}
    </Link>
  );
}

/** The header nav below `md`, for pages without their own menu. */
function SiteMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 md:hidden"
            aria-label="Open site menu"
          />
        }
      >
        <MenuIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-40">
        {siteNav.map((link) => (
          <DropdownMenuItem
            key={link.to}
            render={<Link to={link.to} prefetch="intent" />}
          >
            {link.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * `start` replaces the small-screen site menu (docs pages pass their sidebar sheet);
 * `containerClassName` lets a page match the header's width to its content.
 */
export function SiteHeader({
  start,
  containerClassName,
}: {
  start?: ReactNode;
  containerClassName?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div
        className={cn(
          "mx-auto flex h-14 max-w-screen-2xl items-center gap-2 px-4 sm:px-6",
          containerClassName,
        )}
      >
        {start ?? <SiteMenu />}
        <Logo />
        <nav
          aria-label="Site"
          className="ml-6 hidden items-center gap-5 text-sm text-muted-foreground md:flex"
        >
          {siteNav.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              prefetch="intent"
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
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
          <Button
            variant="ghost"
            size="icon"
            render={<a href={site.npmOrg} aria-label="npm packages" />}
          >
            <NpmIcon className="size-4" />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
