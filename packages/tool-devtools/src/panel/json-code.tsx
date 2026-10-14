import { useMemo, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "cn";
import { jsonColors } from "./format";

/** Longer text is not highlighted, so typing in a large state stays quick. */
const HIGHLIGHT_LIMIT = 100_000;

/**
 * A string, with the colon after it when it is a key; a literal; a number; or punctuation.
 * It also reads JSON being typed: a string not closed yet runs to the end of its line.
 */
const TOKEN =
  /("(?:[^"\\\n]|\\.)*"?)(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],]/g;

type TokenKind = keyof typeof jsonColors;

const kindOf = (token: string): TokenKind => {
  if (token === "true" || token === "false") return "boolean";
  if (token === "null") return "null";
  return /^-?\d/.test(token) ? "number" : "punctuation";
};

const highlight = (text: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const push = (kind: TokenKind, token: string): void => {
    nodes.push(
      <span key={nodes.length} data-token={kind} className={jsonColors[kind]}>
        {token}
      </span>,
    );
  };
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [token, string, colon] = match;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (string === undefined) push(kindOf(token), token);
    else if (colon === undefined) push("string", string);
    else {
      push("key", string);
      push("punctuation", colon);
    }
    last = match.index + token.length;
  }
  nodes.push(text.slice(last));
  return nodes;
};

/**
 * A textarea for JSON, with its syntax highlighted. A highlighted copy of the text sits
 * underneath and the textarea on top shows only its caret and selection, so typing,
 * selecting and undo stay native. Lines do not wrap, so the two copies stay in line.
 */
export function JsonCodeArea({
  value,
  className,
  onScroll,
  ...props
}: ComponentProps<"textarea"> & { value: string }) {
  const code = useRef<HTMLElement>(null);
  const highlighted = useMemo(
    () => (value.length > HIGHLIGHT_LIMIT ? value : highlight(value)),
    [value],
  );

  return (
    <div
      className={cn(
        "relative rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-3 has-[[aria-invalid=true]]:ring-destructive/20 dark:bg-input/30 dark:has-[[aria-invalid=true]]:border-destructive/50 dark:has-[[aria-invalid=true]]:ring-destructive/40",
        className,
      )}
    >
      <pre
        aria-hidden
        data-slot="json-highlight"
        className="pointer-events-none absolute inset-0 m-0 overflow-hidden px-2.5 py-2 font-mono text-xs leading-5 whitespace-pre text-foreground"
      >
        {/* Moved with the textarea's scroll; the last "\n" gives a trailing newline its line. */}
        <code ref={code} className="block">
          {highlighted}
          {"\n"}
        </code>
      </pre>
      <textarea
        value={value}
        wrap="off"
        spellCheck={false}
        onScroll={(event) => {
          const { scrollLeft, scrollTop } = event.currentTarget;
          if (code.current)
            code.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
          onScroll?.(event);
        }}
        className="absolute inset-0 size-full resize-none overflow-auto bg-transparent px-2.5 py-2 font-mono text-xs leading-5 whitespace-pre text-transparent caret-foreground outline-none selection:bg-primary/25"
        {...props}
      />
    </div>
  );
}
