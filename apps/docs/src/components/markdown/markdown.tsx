import type { Root } from "hast";
import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import { ArrowUpRightIcon, LinkIcon } from "lucide-react";
import { useMemo, type ComponentProps } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Link } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodeBlock } from "./code-block.tsx";
import { CodeGroup } from "./code-group.tsx";
import { DocsAlert } from "./docs-alert.tsx";

function heading(Tag: "h2" | "h3" | "h4") {
  return function Heading({ id, children, ...props }: ComponentProps<"h2">) {
    return (
      <Tag id={id} className="group/heading scroll-mt-20" {...props}>
        {children}
        {id && (
          <a
            href={`#${id}`}
            aria-label="Link to this section"
            className="ml-2 inline-block align-middle text-muted-foreground no-underline opacity-0 transition-opacity group-hover/heading:opacity-100 focus-visible:opacity-100"
          >
            <LinkIcon className="size-4" />
          </a>
        )}
      </Tag>
    );
  };
}

function DocLink({ href = "", children, ...props }: ComponentProps<"a">) {
  // Pages are client-side navigations; the .md twins and llms files are plain documents.
  if (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !/\.(md|txt|xml|json)(#|$)/.test(href)
  ) {
    return (
      <Link to={href} prefetch="intent" {...props}>
        {children}
      </Link>
    );
  }
  const external = /^https?:\/\//.test(href);
  return (
    <a href={href} {...props}>
      {children}
      {external && (
        <ArrowUpRightIcon
          aria-hidden
          className="ml-0.5 inline size-3.5 align-baseline opacity-60"
        />
      )}
    </a>
  );
}

// Custom tags come from the build (markdown.server.ts): docs-alert, docs-code, docs-code-group.
const components = {
  a: DocLink,
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  table: (props: ComponentProps<"table">) => (
    <div className="not-prose my-6 overflow-hidden rounded-lg border">
      <Table {...props} />
    </div>
  ),
  thead: TableHeader,
  tbody: TableBody,
  tr: TableRow,
  th: (props: ComponentProps<"th">) => (
    <TableHead className="bg-muted/40 px-3" {...props} />
  ),
  td: (props: ComponentProps<"td">) => (
    <TableCell className="px-3 whitespace-normal" {...props} />
  ),
  "docs-alert": DocsAlert,
  "docs-code": CodeBlock,
  "docs-code-group": CodeGroup,
} as unknown as Partial<Components>;

export function Markdown({ hast }: { hast: Root }) {
  return useMemo(
    () => toJsxRuntime(hast, { Fragment, jsx, jsxs, components }),
    [hast],
  );
}
