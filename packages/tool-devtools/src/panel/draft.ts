import { useMemo, useState } from "react";
import { jsonEqual } from "@homeostate/core";
import type { Json } from "../json";

export type Parsed = { ok: true; value: Json } | { ok: false; error: string };

/** How a draft shows a value as text and reads it back. */
export interface DraftFormat {
  format: (value: Json) => string;
  /** Reads `text`; `base` is the value editing began with. */
  parse: (text: string, base: Json) => Parsed;
  /** Defaults to `jsonEqual`. */
  equal?: (a: Json, b: Json) => boolean;
}

/** Text edited over a live value: `base` is the value editing began with, `baseText` its text. */
export interface Draft {
  readonly base: Json;
  readonly baseText: string;
  readonly text: string;
}

export interface DraftView {
  /** The text differs from where editing began. */
  dirty: boolean;
  /** The value changed since editing began. */
  stale: boolean;
  parsed: Parsed;
  /** Edited, parses, and would not overwrite a change made since editing began. */
  canCommit: boolean;
}

const equalOf = (format: DraftFormat) => format.equal ?? jsonEqual;

/** A clean draft of `value`; also how "Load latest" drops an edit. */
export const startDraft = (value: Json, format: DraftFormat): Draft => {
  const text = format.format(value);
  return { base: value, baseText: text, text };
};

export const editDraft = (draft: Draft, text: string): Draft => ({
  ...draft,
  text,
});

/** Follows `value` until edited; an edited draft is kept, to be flagged as stale. */
export const followValue = (
  draft: Draft,
  value: Json,
  format: DraftFormat,
): Draft =>
  draft.text !== draft.baseText || equalOf(format)(value, draft.base)
    ? draft
    : startDraft(value, format);

/** Marks `value`, read from the draft's text, as applied: the draft is clean and keeps its text. */
export const markApplied = (draft: Draft, value: Json): Draft => ({
  base: value,
  baseText: draft.text,
  text: draft.text,
});

export const readDraft = (
  draft: Draft,
  value: Json,
  format: DraftFormat,
): DraftView => {
  const dirty = draft.text !== draft.baseText;
  const stale = !equalOf(format)(value, draft.base);
  const parsed = format.parse(draft.text, draft.base);
  return { dirty, stale, parsed, canCommit: dirty && !stale && parsed.ok };
};

/**
 * A draft over a live `value`, which peers may change while it is edited. Keep `format` stable
 * across renders.
 */
export function useDraft(value: Json, format: DraftFormat) {
  const [state, setState] = useState(() => startDraft(value, format));
  const draft = followValue(state, value, format);
  if (draft !== state) setState(draft);
  const view = useMemo(
    () => readDraft(draft, value, format),
    [draft, value, format],
  );

  return {
    ...view,
    text: draft.text,
    edit: (text: string): void => setState((last) => editDraft(last, text)),
    loadLatest: (): void => setState(startDraft(value, format)),
    applied: (next: Json): void => setState((last) => markApplied(last, next)),
  };
}
