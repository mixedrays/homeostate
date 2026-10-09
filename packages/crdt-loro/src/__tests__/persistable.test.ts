import { LoroDoc } from "loro-crdt";
import { describePersistableDoc } from "@homeostate/core/conformance";
import { createLoroBackend, createLoroPersistable } from "../index.js";

describePersistableDoc("createLoroPersistable", {
  createDoc: () => new LoroDoc(),
  persistable: createLoroPersistable,
  backend: (doc) => createLoroBackend(doc, "shared"),
  exchange: (a, b) => {
    b.import(a.export({ mode: "update", from: b.version() }));
    a.import(b.export({ mode: "update", from: a.version() }));
  },
});
