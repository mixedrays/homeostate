export { createSyncEngine } from "./sync-engine.js";
export { createPersistence } from "./persistence.js";
export { getChanges } from "./diff.js";
export { toJsonValue } from "./json.js";
export { applyChanges, applyStringChanges } from "./apply.js";
export type { ApplyOps } from "./apply.js";
export type { Diffable, DiffOptions, TextPolicy } from "./diff.js";
export { ChangeType } from "./change.js";
export type { Change } from "./change.js";
export { defaultSyncFilter } from "./types.js";
export type {
  CrdtBackend,
  Persistence,
  PersistableDoc,
  PersistenceAdapter,
  PersistenceConfig,
  PersistenceStats,
  SeedStrategy,
  StoredUpdates,
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  Unsubscribe,
} from "./types.js";
