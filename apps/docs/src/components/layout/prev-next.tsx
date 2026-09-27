import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Link } from "react-router";
import type { NavLink } from "@/content/types.ts";

export function PrevNext({ prev, next }: { prev?: NavLink; next?: NavLink }) {
  if (!prev && !next) return null;
  return (
    <nav
      aria-label="Previous and next page"
      className="grid gap-3 sm:grid-cols-2"
    >
      {prev && (
        <Link
          to={prev.path}
          prefetch="intent"
          className="group rounded-lg border p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeftIcon className="size-3" /> Previous
          </div>
          <div className="mt-1 font-medium">{prev.label}</div>
        </Link>
      )}
      {next && (
        <Link
          to={next.path}
          prefetch="intent"
          className="group rounded-lg border p-4 text-right transition-colors hover:bg-muted/50 sm:col-start-2"
        >
          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
            Next <ArrowRightIcon className="size-3" />
          </div>
          <div className="mt-1 font-medium">{next.label}</div>
        </Link>
      )}
    </nav>
  );
}
