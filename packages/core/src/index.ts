export { createSyncEngine } from "./sync-engine.js";
export { getChanges } from "./diff.js";
export { applyChanges } from "./apply.js";
export type { ApplyOps } from "./apply.js";
export type { Diffable } from "./diff.js";
export { ChangeType } from "./change.js";
export type { Change } from "./change.js";
export { defaultSyncFilter } from "./types.js";
export type {
  CrdtBackend,
  SeedStrategy,
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  Unsubscribe,
} from "./types.js";
