import { useMemo, useState } from "react";
import { cn } from "cn";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { isRecord, type Json } from "../json";

type Parsed = { ok: true; value: Json } | { ok: false; error: string };

const parse = (text: string, requireObject: boolean): Parsed => {
  try {
    const value = JSON.parse(text) as Json;
    if (requireObject && !isRecord(value))
      return { ok: false, error: "The state must be a JSON object." };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};

interface JsonEditorProps {
  value: Json;
  /** Throws to report a store that rejected the value, e.g. a MobX-State-Tree type check. */
  onApply: (value: Json) => void;
  /** Shows Cancel instead of Reset. */
  onCancel?: () => void;
  requireObject?: boolean;
  label: string;
  className?: string;
}

/**
 * A JSON textarea over a live value. Until you type it follows the value; once you have,
 * a change underneath is flagged instead of overwriting your edit.
 */
export function JsonEditor({
  value,
  onApply,
  onCancel,
  requireObject = false,
  label,
  className,
}: JsonEditorProps) {
  const latest = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const [base, setBase] = useState(latest);
  const [text, setText] = useState(latest);
  const [applyError, setApplyError] = useState<string | null>(null);
  const dirty = text !== base;

  if (latest !== base && !dirty) {
    setBase(latest);
    setText(latest);
  }
  const stale = latest !== base;
  const parsed = useMemo(
    () => parse(text, requireObject),
    [text, requireObject],
  );

  const load = (next: string): void => {
    setBase(next);
    setText(next);
    setApplyError(null);
  };

  const apply = (): void => {
    if (!parsed.ok || !dirty) return;
    try {
      onApply(parsed.value);
      setBase(text);
      setApplyError(null);
    } catch (error) {
      setApplyError((error as Error).message);
    }
  };

  const error = parsed.ok ? applyError : parsed.error;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {stale && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">
          <span className="flex-1">
            The value changed since you started editing.
          </span>
          <Button size="xs" variant="outline" onClick={() => load(latest)}>
            Load latest
          </Button>
        </div>
      )}
      <Textarea
        value={text}
        aria-label={label}
        aria-invalid={!parsed.ok || undefined}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          setApplyError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            apply();
          }
        }}
        className="min-h-32 flex-1 resize-none field-sizing-fixed font-mono text-xs leading-5 md:text-xs"
      />
      <div className="flex items-center gap-2">
        <p
          role={error ? "alert" : undefined}
          className="min-w-0 flex-1 truncate text-xs text-destructive"
          title={error ?? undefined}
        >
          {error}
        </p>
        {onCancel ? (
          <Button size="xs" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            disabled={!dirty}
            onClick={() => load(latest)}
          >
            Reset
          </Button>
        )}
        <Button
          size="xs"
          disabled={!dirty || !parsed.ok}
          onClick={apply}
          title="Apply (⌘/Ctrl+Enter)"
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
