import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "../components/ui/button";

export function CopyButton({
  text,
  label = "Copy",
  className,
  iconOnly = false,
}: {
  text: string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = (): void => {
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  const Icon = copied ? Check : Copy;

  return (
    <Button
      size={iconOnly ? "icon-xs" : "xs"}
      variant="ghost"
      onClick={copy}
      className={className}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? (copied ? "Copied" : label) : undefined}
    >
      <Icon />
      {iconOnly ? (
        <span role="status" className="sr-only">
          {copied ? "Copied" : ""}
        </span>
      ) : copied ? (
        "Copied"
      ) : (
        label
      )}
    </Button>
  );
}
