import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "../components/ui/button";

export function CopyButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
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
    <Button size="xs" variant="ghost" onClick={copy} className={className}>
      <Icon />
      {copied ? "Copied" : label}
    </Button>
  );
}
