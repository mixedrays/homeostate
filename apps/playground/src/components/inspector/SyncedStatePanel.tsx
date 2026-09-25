import { useEffect, useId, useState } from 'react';
import { Braces, Check, ChevronDown, Copy } from 'lucide-react';
import type { Doc } from 'yjs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useSharedDocJson } from '../../hooks/useSharedDocJson';
import { InlineCode } from '../InlineCode';
import { JsonView } from './JsonView';

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });

interface SyncedStatePanelProps {
  doc: Doc;
  mapName: string;
}

export function SyncedStatePanel({ doc, mapName }: SyncedStatePanelProps) {
  const json = useSharedDocJson(doc, mapName);
  const [open, setOpen] = useState(true);
  const [updated, setUpdated] = useState(() => ({ json, at: new Date() }));
  const headingId = useId();

  if (updated.json !== json) setUpdated({ json, at: new Date() });

  return (
    <Card
      role="region"
      aria-labelledby={headingId}
      size="sm"
      className="py-0 lg:max-h-[calc(100vh_-_7rem)]"
    >
      <Collapsible open={open} onOpenChange={setOpen} className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 px-(--card-spacing) py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Braces size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id={headingId} className="text-sm font-semibold text-foreground">
                Synced state
              </h2>
              <p className="truncate text-xs text-muted-foreground">Live JSON of the Yjs document</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <CopyButton text={json} />
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={open ? 'Hide synced state' : 'Show synced state'}
                />
              }
            >
              <ChevronDown
                aria-hidden
                className={cn('transition-transform', open && 'rotate-180')}
              />
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="flex min-h-0 flex-col">
          <JsonView
            code={json}
            label="Synced state as JSON"
            className="max-h-96 min-h-0 flex-1 border-t lg:max-h-none"
          />
          <div className="flex items-center justify-between gap-3 border-t px-(--card-spacing) py-2 text-xs text-muted-foreground">
            <span className="truncate">
              Y.Map <InlineCode>{mapName}</InlineCode>
            </span>
            <span className="shrink-0 tabular-nums">
              Updated <time dateTime={updated.at.toISOString()}>{timeFormat.format(updated.at)}</time>
            </span>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false)
    );
  };

  const Icon = copied ? Check : Copy;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copy}
      title="Copy JSON to clipboard"
      className={cn(copied ? 'text-emerald-700 hover:text-emerald-700' : 'text-muted-foreground')}
    >
      <Icon aria-hidden />
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}
