export { createSyncEngine, WriteLoopError } from "./sync-engine.js";
export { createPersistence } from "./persistence.js";
export { scopeAdapter } from "./scope-adapter.js";
export type { AdapterScope } from "./scope-adapter.js";
export { getChanges } from "./diff.js";
export { jsonEqual, toJsonValue } from "./json.js";
export { keepIdentity } from "./patching.js";
export { mergeConcurrent } from "./merge.js";
export type { MergeOptions } from "./merge.js";
export { applyChanges } from "./apply.js";
export { createCrdtBackend } from "./crdt-backend.js";
export type { CrdtBackendParts } from "./crdt-backend.js";
export type { ApplyOps, ContainerKind } from "./apply.js";
export type { DiffOptions, TextPolicy } from "./diff.js";
export type { Change, ListChange, RecordChange, TextChange } from "./change.js";
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
  SetupOptions,
  StoredUpdates,
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  SyncEngineOptions,
  SyncErrorSource,
  SyncEvent,
  SyncFailure,
  SyncStatus,
  Unsubscribe,
} from "./types.js";
