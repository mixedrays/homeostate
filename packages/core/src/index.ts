export { createSyncEngine, WriteLoopError } from "./sync-engine.js";
export { createPersistence } from "./persistence.js";
export { getChanges } from "./diff.js";
export { toJsonValue } from "./json.js";
export { applyChanges, applyStringChanges } from "./apply.js";
export type { ApplyOps, ContainerKind } from "./apply.js";
export type { Diffable, DiffOptions, TextPolicy } from "./diff.js";
export { ChangeType } from "./change.js";
export type {
  Change,
  EditScript,
  ListChange,
  RecordChange,
  TextChange,
} from "./change.js";
export { defaultSyncFilter } from "./types.js";
export type {
  CrdtBackend,
  Persistence,
  PersistableDoc,
  PersistenceAdapter,
  PersistenceConfig,
  PersistenceStats,
  SeedStrategy,
  SetupOptions,
  StoredUpdates,
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  SyncErrorSource,
  Unsubscribe,
} from "./types.js";
