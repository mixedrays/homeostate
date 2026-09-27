import {
  InfoIcon,
  LightbulbIcon,
  MessageSquareWarningIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Kind = "note" | "tip" | "important" | "warning" | "caution";

const KINDS: Record<
  Kind,
  { title: string; icon: LucideIcon; className: string }
> = {
  note: {
    title: "Note",
    icon: InfoIcon,
    className: "text-sky-700 dark:text-sky-400",
  },
  tip: {
    title: "Tip",
    icon: LightbulbIcon,
    className: "text-emerald-700 dark:text-emerald-400",
  },
  important: {
    title: "Important",
    icon: MessageSquareWarningIcon,
    className: "text-violet-700 dark:text-violet-400",
  },
  warning: {
    title: "Warning",
    icon: TriangleAlertIcon,
    className: "text-amber-700 dark:text-amber-400",
  },
  caution: {
    title: "Caution",
    icon: OctagonAlertIcon,
    className: "text-destructive",
  },
};

/** A GitHub alert (`> [!NOTE]` … `> [!CAUTION]`). */
export function DocsAlert({
  kind,
  children,
}: {
  kind: Kind;
  children?: ReactNode;
}) {
  const { title, icon: Icon, className } = KINDS[kind] ?? KINDS.note;
  return (
    <Alert className="not-prose my-6 px-3 py-2.5" role="note">
      <Icon className={className} />
      <AlertTitle className={className}>{title}</AlertTitle>
      <AlertDescription className="text-foreground/85 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_p]:leading-relaxed">
        {children}
      </AlertDescription>
    </Alert>
  );
}
