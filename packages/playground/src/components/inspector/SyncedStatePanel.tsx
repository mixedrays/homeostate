import { useEffect, useId, useState } from 'react';
import { Braces, Check, ChevronDown, Copy } from 'lucide-react';
import type { Doc } from 'yjs';
import { useSharedDocJson } from '../../hooks/useSharedDocJson';
import { buttonIcon, cx, focusRing } from '../ui/classes';
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
  const bodyId = useId();

  if (updated.json !== json) setUpdated({ json, at: new Date() });

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-slate-200 lg:max-h-[calc(100vh_-_7rem)]"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Braces size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="text-sm font-semibold text-slate-900">
              Synced state
            </h2>
            <p className="truncate text-xs text-slate-500">Live JSON of the Yjs document</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CopyButton text={json} />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={open ? bodyId : undefined}
            aria-label={open ? 'Hide synced state' : 'Show synced state'}
            className={cx(buttonIcon, 'h-8 w-8')}
          >
            <ChevronDown
              size={16}
              aria-hidden
              className={cx('transition-transform', open && 'rotate-180')}
            />
          </button>
        </div>
      </div>

      {open && (
        <>
          <JsonView
            id={bodyId}
            code={json}
            label="Synced state as JSON"
            className="max-h-96 min-h-0 flex-1 border-t border-slate-200 lg:max-h-none"
          />
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2 text-xs text-slate-400 sm:px-5">
            <span className="truncate">
              Y.Map{' '}
              <code className="rounded-sm bg-slate-100 px-1 py-0.5 font-mono text-slate-500">
                {mapName}
              </code>
            </span>
            <span className="shrink-0 tabular-nums">
              Updated <time dateTime={updated.at.toISOString()}>{timeFormat.format(updated.at)}</time>
            </span>
          </div>
        </>
      )}
    </section>
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
    <button
      type="button"
      onClick={copy}
      title="Copy JSON to clipboard"
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition',
        copied ? 'text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        focusRing
      )}
    >
      <Icon size={14} aria-hidden />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
