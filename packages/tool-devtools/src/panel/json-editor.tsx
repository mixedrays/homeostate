import { useState } from "react";
import { cn } from "cn";
import { Button } from "../components/ui/button";
import { isRecord, type Json } from "../json";
import { useDraft, type DraftFormat, type Parsed } from "./draft";
import { JsonCodeArea } from "./json-code";

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

const format = (value: Json): string => JSON.stringify(value, null, 2);
const anyJson: DraftFormat = { format, parse: (text) => parse(text, false) };
const objectJson: DraftFormat = { format, parse: (text) => parse(text, true) };

interface JsonEditorProps {
  value: Json;
  /** Throws to report a store that rejected the value, e.g. a MobX-State-Tree type check. */
  onApply: (value: Json) => void;
  /** Shows Cancel instead of Reset, and Escape cancels too. */
  onCancel?: () => void;
  requireObject?: boolean;
  label: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * A highlighted JSON textarea over a live value. Until you type it follows the value; once you
 * have, a change underneath is flagged and blocks Apply until you load the latest value.
 */
export function JsonEditor({
  value,
  onApply,
  onCancel,
  requireObject = false,
  label,
  className,
  autoFocus,
}: JsonEditorProps) {
  const draft = useDraft(value, requireObject ? objectJson : anyJson);
  const [applyError, setApplyError] = useState<string | null>(null);
  const { parsed } = draft;

  const load = (): void => {
    draft.loadLatest();
    setApplyError(null);
  };

  const apply = (): void => {
    if (!draft.canCommit || !parsed.ok) return;
    try {
      onApply(parsed.value);
      draft.applied(parsed.value);
      setApplyError(null);
    } catch (error) {
      setApplyError((error as Error).message);
    }
  };

  const error = parsed.ok ? applyError : parsed.error;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {draft.stale && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">
          <span className="flex-1">
            The value changed since you started editing.
          </span>
          <Button size="xs" variant="outline" onClick={load}>
            Load latest
          </Button>
        </div>
      )}
      <JsonCodeArea
        value={draft.text}
        autoFocus={autoFocus}
        aria-label={label}
        aria-invalid={!parsed.ok || undefined}
        onChange={(event) => {
          draft.edit(event.target.value);
          setApplyError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            apply();
          } else if (event.key === "Escape" && onCancel) {
            // Keep Escape from closing the panel.
            event.stopPropagation();
            onCancel();
          }
        }}
        className="min-h-32 flex-1"
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
            disabled={!draft.dirty}
            onClick={load}
          >
            Reset
          </Button>
        )}
        <Button
          size="xs"
          disabled={!draft.canCommit}
          onClick={apply}
          title="Apply (⌘/Ctrl+Enter)"
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
