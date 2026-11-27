import type { StoreAdapter } from "@homeostate/core";
import type { TodoState } from "@homeostate/benchmark-crdt";
import type { ReactElement } from "react";

/**
 * One counter per component of the fixture tree; `row`, summed over every row, is the reported
 * metric: memoized rows re-rendered for one remote change.
 */
export interface Counters {
  app: number;
  searchBox: number;
  list: number;
  row: number;
  footer: number;
}

export interface FixtureInstance {
  /** The adapter the sync engine drives; the store behind it belongs to the fixture. */
  adapter: StoreAdapter<TodoState>;
  /** The tree to mount: `App → SearchBox, List → Row × N, Footer`. */
  tree: ReactElement;
  /** Live counts, mutated by the components as they render. */
  counters: Counters;
}

/**
 * One state manager, its adapter, and the same tree rendered idiomatically for that library,
 * memoization included: what a typical app gets, not a hand-tuned one.
 */
export interface Fixture {
  name: string;
  description: string;
  /** Builds a fresh store seeded with `initial` and the components bound to it. */
  create(initial: TodoState): FixtureInstance;
}

export interface RenderResult {
  adapter: string;
  scenario: string;
  size: number;
  /** Row components React re-rendered for the remote change; ideal 1. */
  rowRenders: number;
  /** Whether the list container itself re-rendered, 0 or 1. */
  listRenders: number;
  searchBoxRenders: number;
  footerRenders: number;
  appRenders: number;
  /** The peer's write until this peer's store has settled, React not included; advisory. */
  applyMs: number;
  /** React's render and commit for that change; advisory. */
  commitMs: number;
  /** First render of the whole list, like `adopt` in the write-path benchmark; advisory. */
  mountMs: number;
}

export interface RenderMeta {
  date: string;
  node: string;
  commit: string | null;
  dirty: boolean | null;
  versions: Record<string, string>;
}

export interface RenderReport {
  meta: RenderMeta;
  results: RenderResult[];
}
