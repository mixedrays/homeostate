import type { ReactNode } from "react";
import type { WebsocketProvider } from "y-websocket";
import type { Doc } from "yjs";
import { Card, CardContent } from "@/components/ui/card";
import { apps, type DemoMeta } from "../../demos";
import { TODO_ROOM } from "../../sync";
import { DemoLayout } from "../DemoLayout";
import { InlineCode } from "../InlineCode";

interface TodoDemoLayoutProps {
  demo: DemoMeta;
  provider: WebsocketProvider;
  doc: Doc;
  children: ReactNode;
}

/** The page around one store's todo list, leading back to the other stores. */
export function TodoDemoLayout({
  demo,
  provider,
  doc,
  children,
}: TodoDemoLayoutProps) {
  return (
    <DemoLayout
      demo={demo}
      provider={provider}
      doc={doc}
      back={{ to: apps.todo.path, label: "All stores" }}
      footer={
        <>
          Every store joins the room <InlineCode>{TODO_ROOM}</InlineCode>. Open
          another store or a second tab to watch changes propagate.
        </>
      }
    >
      <Card role="region" aria-label={`${demo.name} todo list`}>
        <CardContent className="space-y-6 sm:px-6 sm:py-2">
          {children}
        </CardContent>
      </Card>
    </DemoLayout>
  );
}
