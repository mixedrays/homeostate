import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { cn } from "cn";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { NavLink, NavPackage, NavSection } from "@/content/types.ts";

function NavList({
  links,
  pathname,
  onNavigate,
  className,
}: {
  links: NavLink[];
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-0.5", className)}>
      {links.map((link) => {
        const active = link.path === pathname;
        return (
          <li key={link.path}>
            <Link
              to={link.path}
              prefetch="intent"
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-muted font-medium text-foreground",
              )}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function PackageItem({
  pkg,
  pathname,
  onNavigate,
}: {
  pkg: NavPackage;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = pkg.links.some((link) => link.path === pathname);
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "group/trigger flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
          active
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span>{pkg.label}</span>
        <ChevronRightIcon className="size-3.5 transition-transform group-data-panel-open/trigger:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <NavList
          links={pkg.links}
          pathname={pathname}
          onNavigate={onNavigate}
          className="ml-3 border-l py-0.5 pl-2"
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function Sidebar({
  nav,
  onNavigate,
}: {
  nav: NavSection[];
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6 text-sm">
      {nav.map((section) => (
        <div key={section.id}>
          <h2 className="mb-1.5 px-2 text-xs font-medium tracking-wide text-muted-foreground/80 uppercase">
            {section.title}
          </h2>
          {section.links.length > 0 && (
            <NavList
              links={section.links}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          )}
          {section.packages.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {section.packages.map((pkg) => (
                <PackageItem
                  key={pkg.slug}
                  pkg={pkg}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
