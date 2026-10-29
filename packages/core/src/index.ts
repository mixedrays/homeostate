export { createSyncEngine, WriteLoopError } from "./sync-engine.js";
export { createPersistence } from "./persistence.js";
export { getChanges } from "./diff.js";
export { jsonEqual, toJsonValue } from "./json.js";
export { keepIdentity } from "./patching.js";
export { applyChanges, applyStringChanges } from "./apply.js";
export { createCrdtBackend } from "./crdt-backend.js";
export type { CrdtBackendOptions, CrdtBackendParts } from "./crdt-backend.js";
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
  JsonObject,
  JsonObjectInput,
  Persistence,
  PersistableDoc,
  PersistenceAdapter,
  PersistenceConfig,
  PersistenceLoadResult,
  PersistenceStats,
  SeedStrategy,
  SetupOptions,
  StoredUpdates,
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  SyncErrorSource,
  SyncEvent,
  Unsubscribe,
} from "./types.js";
