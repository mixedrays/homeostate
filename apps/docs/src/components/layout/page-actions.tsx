import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteUrl } from "@/lib/site-url.ts";

/** Copy the page's markdown, open it, or hand its .md URL to an assistant. */
export function PageActions({ mdPath }: { mdPath: string }) {
  const [copied, setCopied] = useState(false);
  const prompt = `Read ${siteUrl}${mdPath} so I can ask questions about it.`;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    const res = await fetch(mdPath);
    await navigator.clipboard.writeText(await res.text());
    setCopied(true);
  };

  return (
    <div className="flex items-center">
      <Button
        variant="outline"
        size="sm"
        className="rounded-r-none"
        onClick={copy}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy page"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              className="-ml-px rounded-l-none"
              aria-label="More page actions"
            />
          }
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-52">
          <DropdownMenuItem
            render={<a href={mdPath} target="_blank" rel="noopener" />}
          >
            <FileTextIcon />
            View as Markdown
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <a
                href={`https://claude.ai/new?q=${encodeURIComponent(prompt)}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <ExternalLinkIcon />
            Open in Claude
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <a
                href={`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <ExternalLinkIcon />
            Open in ChatGPT
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
