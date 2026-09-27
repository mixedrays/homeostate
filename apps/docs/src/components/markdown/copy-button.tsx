import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

export function CopyButton({
  getText,
  label = "Copy code",
  className,
}: {
  getText: () => string | Promise<string>;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Copied" : label}
      className={cn("text-muted-foreground", className)}
      onClick={async () => {
        await navigator.clipboard.writeText(await getText());
        setCopied(true);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
