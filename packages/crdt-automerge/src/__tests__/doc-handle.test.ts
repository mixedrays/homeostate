import * as A from "@automerge/automerge";
import { Repo, type DocHandle } from "@automerge/automerge-repo";
import { afterAll } from "vitest";
import { describeCrdtBackend } from "@homeostate/core/conformance";
import { createAutomergeBackend } from "../index.js";

const NAME = "shared";

type Root = Record<string, unknown>;

const repo = new Repo();
afterAll(() => repo.shutdown());

const actor = (id: number): string => id.toString(16).padStart(2, "0");

const createDocHandle = (id?: number): DocHandle<Root> => {
  const handle = repo.create<Root>();
  if (id !== undefined) handle.update((doc) => A.clone(doc, actor(id)));
  return handle;
};

describeCrdtBackend("createAutomergeBackend with a DocHandle", {
  createDoc: createDocHandle,
  backend: (handle, options) => createAutomergeBackend(handle, NAME, options),
  exchange: (a, b) => {
    b.merge(a);
    a.merge(b);
  },
  onLocalUpdate: (handle, listener) => {
    // The changes this replica's actor made, as a network adapter would send them.
    const onChange = ({
      patchInfo: { before, after },
    }: {
      patchInfo: A.PatchInfo<Root>;
    }): void => {
      const self = A.getActorId(after);
      for (const change of A.getChanges(before, after))
        if (A.decodeChange(change).actor === self) listener(change);
    };
    handle.on("change", onChange);
    return () => handle.off("change", onChange);
  },
  storeForeign: (handle, key, value) => {
    handle.change((doc) => {
      doc[NAME] ??= {};
      (doc[NAME] as Root)[key] = value;
    });
  },
});
