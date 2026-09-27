import { useRef } from "react";
import { CopyButton } from "./copy-button.tsx";

export interface CodeBlockProps {
  /** Shiki's HTML, highlighted at build time. */
  html: string;
  language?: string;
  title?: string;
  tab?: string;
}

/** The scrolling code with a copy button, without a frame; used alone and inside tab groups. */
export function CodeBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="relative">
      <div
        ref={ref}
        className="overflow-x-auto py-3 font-mono text-[13px] leading-6 [&_pre]:outline-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <CopyButton
        getText={() => ref.current?.textContent ?? ""}
        className="absolute top-2 right-2 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover/code:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      />
    </div>
  );
}

export function CodeBlock({ html, title }: CodeBlockProps) {
  return (
    <figure className="group/code not-prose my-6 overflow-hidden rounded-lg border bg-muted/40">
      {title && (
        <figcaption className="border-b px-4 py-2 font-mono text-xs text-muted-foreground">
          {title}
        </figcaption>
      )}
      <CodeBody html={html} />
    </figure>
  );
}
