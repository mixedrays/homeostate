import { Children, isValidElement, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  packageManagerStore,
  type PackageManager,
} from "@/lib/package-manager.ts";
import { CodeBody, type CodeBlockProps } from "./code-block.tsx";

function blocksOf(children: ReactNode): CodeBlockProps[] {
  return Children.toArray(children)
    .filter(isValidElement<CodeBlockProps>)
    .map((child) => child.props);
}

function TabbedCode({
  blocks,
  value,
  onValueChange,
}: {
  blocks: CodeBlockProps[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      className="group/code not-prose my-6 gap-0 overflow-hidden rounded-lg border bg-muted/40"
    >
      <div className="border-b px-2">
        <TabsList variant="line" className="h-9">
          {blocks.map((block) => (
            <TabsTrigger
              key={block.tab}
              value={block.tab ?? ""}
              className="px-2 font-mono text-xs"
            >
              {block.tab}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {blocks.map((block) => (
        <TabsContent key={block.tab} value={block.tab ?? ""}>
          <CodeBody html={block.html} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function InstallTabs({ blocks }: { blocks: CodeBlockProps[] }) {
  const [manager, setManager] = packageManagerStore.useValue();
  return (
    <TabbedCode
      blocks={blocks}
      value={manager}
      onValueChange={(next) => setManager(next as PackageManager)}
    />
  );
}

function LocalTabs({ blocks }: { blocks: CodeBlockProps[] }) {
  const [value, setValue] = useState(blocks[0]?.tab ?? "");
  return <TabbedCode blocks={blocks} value={value} onValueChange={setValue} />;
}

/** `install` fences (one tab per package manager, shared choice) and consecutive `tab=` fences. */
export function CodeGroup({
  variant,
  children,
}: {
  variant: "install" | "tabs";
  children?: ReactNode;
}) {
  const blocks = blocksOf(children);
  return variant === "install" ? (
    <InstallTabs blocks={blocks} />
  ) : (
    <LocalTabs blocks={blocks} />
  );
}
