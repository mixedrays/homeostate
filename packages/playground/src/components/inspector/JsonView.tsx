import { useEffect, useRef, useState } from 'react';
import { ChangeType, getChanges } from '@homeostate/core';
import { tokenizeJson, type JsonLine } from '../../lib/highlightJson';
import { cn } from '@/lib/utils';

interface Frame {
  code: string;
  lines: JsonLine[];
  changed: ReadonlySet<number>;
  version: number;
}

const changedLines = (previous: string, next: string): Set<number> => {
  const changed = new Set<number>();
  for (const [type, index] of getChanges(previous.split('\n'), next.split('\n'))) {
    if (type !== ChangeType.DELETE) changed.add(index as number);
  }
  return changed;
};

const indentOf = (tokens: JsonLine): number => {
  const first = tokens[0]?.content ?? '';
  return first.length - first.trimStart().length;
};

const nextFrame = (previous: Frame | null, code: string): Frame => ({
  code,
  lines: tokenizeJson(code),
  changed: previous ? changedLines(previous.code, code) : new Set(),
  version: (previous?.version ?? 0) + 1,
});

interface JsonViewProps {
  code: string;
  label: string;
  id?: string;
  className?: string;
}

export function JsonView({ code, label, id, className }: JsonViewProps) {
  const [frame, setFrame] = useState(() => nextFrame(null, code));
  const scrollRef = useRef<HTMLPreElement>(null);

  if (frame.code !== code) setFrame(nextFrame(frame, code));

  useEffect(() => {
    const container = scrollRef.current;
    const line = container?.querySelector<HTMLElement>('[data-changed]');
    if (!container || !line) return;

    const above = line.offsetTop < container.scrollTop;
    const below =
      line.offsetTop + line.offsetHeight > container.scrollTop + container.clientHeight;
    if (above || below) {
      container.scrollTo({
        top: line.offsetTop - container.clientHeight / 2,
        behavior: 'smooth',
      });
    }
  }, [frame]);

  return (
    <pre
      ref={scrollRef}
      id={id}
      tabIndex={0}
      aria-label={label}
      className={cn(
        'relative overflow-auto py-3 font-mono text-[13px] leading-6 text-foreground/80',
        'whitespace-pre-wrap [overflow-wrap:anywhere]',
        'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
        className
      )}
    >
      <code>
        {frame.lines.map((tokens, index) => {
          const changed = frame.changed.has(index);
          const indent = indentOf(tokens);
          return (
            <span
              key={changed ? `${index}:${frame.version}` : index}
              data-changed={changed ? '' : undefined}
              className={cn(
                'block px-4 hover:bg-muted/60 sm:px-5',
                changed && 'animate-line-flash'
              )}
            >
              <span
                className="block"
                style={{ paddingLeft: `${indent}ch`, textIndent: `-${indent}ch` }}
              >
                {tokens.map((token, position) => (
                  <span key={position} style={{ color: token.color }}>
                    {token.content}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </code>
    </pre>
  );
}
