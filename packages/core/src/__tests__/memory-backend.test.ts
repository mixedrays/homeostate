import { describe, expect, it, vi } from "vitest";
import { createMemoryBackend } from "../testing.js";
import { describeCrdtBackend } from "./crdt-backend-suite.js";

describeCrdtBackend("createMemoryBackend", {
  createDoc: () => createMemoryBackend(),
  backend: (doc) => doc,
  storeForeign: (doc, key, value) => {
    doc.receive({ ...(doc.read() as object), [key]: value });
  },
});

describe("createMemoryBackend", () => {
  it("copies the initial value instead of aliasing it", () => {
    const initial = { list: [1] };
    const backend = createMemoryBackend(initial);

    initial.list.push(2);

    expect(backend.read()).toEqual({ list: [1] });
  });

  it("notifies every subscriber once per receive and stores a copy", () => {
    const backend = createMemoryBackend();
    const first = vi.fn();
    const second = vi.fn();
    backend.subscribe(first);
    backend.subscribe(second);
    const remote = { a: [1] };

    backend.receive(remote);
    remote.a.push(2);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual({ a: [1] });
  });
});
