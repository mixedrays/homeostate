import * as A from "@automerge/automerge";
import { describePersistableDoc } from "../../../core/src/__tests__/persistable-doc-suite.js";
import {
  createAutomergeBackend,
  createAutomergeHandle,
  createAutomergePersistable,
} from "../index.js";

describePersistableDoc("createAutomergePersistable", {
  createDoc: () => createAutomergeHandle<Record<string, unknown>>(),
  persistable: createAutomergePersistable,
  backend: (handle) => createAutomergeBackend(handle, "shared"),
  exchange: (a, b) => {
    b.update((doc) => A.merge(doc, a.doc()));
    a.update((doc) => A.merge(doc, b.doc()));
  },
});
