import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { accentClass, type CardTarget, type PageMeta } from "../demos";

interface DemoCardProps {
  /** The page or app to open: a `path` in this app, or the `url` of another. */
  page: Omit<PageMeta, "path"> & CardTarget;
  /** The label of the call to action at the bottom of the card. */
  action: string;
  /** Anything to show between the description and the call to action. */
  children?: ReactNode;
}

/** A card linking to one demo page, or to an app built on its own, in its accent colour. */
export function DemoCard({ page, action, children }: DemoCardProps) {
  const Icon = page.icon;
  const className = cn(
    accentClass[page.accent],
    "group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
  );

  const card = (
    <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-primary/40">
      <CardHeader>
        <div className="mb-1 flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon size={20} aria-hidden />
          </span>
          <CardTitle className="text-lg font-semibold">{page.name}</CardTitle>
        </div>
        <CardDescription className="leading-relaxed">
          {page.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto space-y-4">
        {children}
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          {action}
          <ArrowRight
            size={16}
            aria-hidden
            className="transition group-hover:translate-x-0.5"
          />
        </span>
      </CardContent>
    </Card>
  );

  return "url" in page ? (
    <a href={page.url} className={className}>
      {card}
    </a>
  ) : (
    <Link to={page.path} className={className}>
      {card}
    </Link>
  );
}
