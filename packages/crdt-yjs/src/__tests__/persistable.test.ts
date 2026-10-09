import * as Y from "yjs";
import { describePersistableDoc } from "@homeostate/core/conformance";
import { createYjsBackend, createYjsPersistable } from "../index.js";

describePersistableDoc("createYjsPersistable", {
  createDoc: () => new Y.Doc(),
  persistable: createYjsPersistable,
  backend: (doc) => createYjsBackend(doc, "shared"),
  exchange: (a, b) => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  },
});
