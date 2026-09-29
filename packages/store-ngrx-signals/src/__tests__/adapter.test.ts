import "@angular/compiler";
import { Injector } from "@angular/core";
import { patchState, signalState } from "@ngrx/signals";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSyncEngine } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { createNgrxSignalsAdapter } from "../index.js";

const cleanups: (() => void)[] = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup()),
);

function setup(
  initialBackend?: object,
  seed: "if-empty" | "never" = "if-empty",
) {
  const injector = Injector.create({ providers: [] });
  cleanups.push(() => injector.destroy());
  const store = signalState({
    shared: { count: 0, label: "initial" } as { count: number; label?: string },
    panelOpen: false,
  });
  const adapter = createNgrxSignalsAdapter(store, {
    select: (state) => state.shared,
    replace: (shared) => patchState(store, { shared }),
    injector,
  });
  const backend = createMemoryBackend(initialBackend);
  const write = vi.spyOn(backend, "write");
  const engine = createSyncEngine(backend, adapter, { seed });
  engine.connect();
  cleanups.push(() => engine.disconnect());
  return { store, adapter, backend, engine, write, injector };
}

describe("NgRx Signals adapter", () => {
  it("syncs local state synchronously and applies remote changes without echo", () => {
    const { store, backend, write } = setup();
    expect(write).toHaveBeenCalledTimes(1);
    patchState(store, { shared: { count: 1, label: "local" } });
    expect(backend.read()).toEqual({ count: 1, label: "local" });
    expect(write).toHaveBeenCalledTimes(2);
    backend.receive({ count: 8, label: "remote" });
    expect(store.shared()).toEqual({ count: 8, label: "remote" });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("adopts an existing room and preserves local-only state", () => {
    const { store, backend, write } = setup({ count: 9, label: "existing" });
    expect(store.shared.count()).toBe(9);
    patchState(store, { panelOpen: true });
    expect(write).not.toHaveBeenCalled();
    backend.receive({ count: 10 });
    expect(store.shared()).toEqual({ count: 10 });
    expect(store.panelOpen()).toBe(true);
  });

  it("removes deleted keys instead of shallow merging them back", () => {
    const { store, backend } = setup();
    backend.receive({ count: 2 });
    expect(Object.prototype.hasOwnProperty.call(store.shared(), "label")).toBe(
      false,
    );
    patchState(store, { shared: { count: 3 } });
    expect(backend.read()).toEqual({ count: 3 });
    backend.receive({});
    expect(store.shared()).toEqual({});
  });

  it("does not seed through the watcher's initial callback with seed: never", () => {
    const { store, backend, write } = setup(undefined, "never");
    expect(backend.read()).toEqual({});
    expect(write).not.toHaveBeenCalled();
    patchState(store, { shared: { count: 4 } });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("disconnects and reconnects outside an Angular injection context", () => {
    const { store, backend, engine, write } = setup();
    engine.disconnect();
    patchState(store, { shared: { count: 2 } });
    backend.receive({ count: 3 });
    expect(store.shared.count()).toBe(2);
    engine.connect();
    expect(store.shared.count()).toBe(3);
    write.mockClear();
    patchState(store, { shared: { count: 4 } });
    expect(write).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual({ count: 4 });
  });

  it("unsubscribes each listener independently", () => {
    const { store, adapter } = setup();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = adapter.subscribe(first);
    const unsubscribeSecond = adapter.subscribe(second);
    unsubscribe();
    patchState(store, { shared: { count: 5 } });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribeSecond();
  });

  it("removes its watcher when the owning injector is destroyed", () => {
    const { store, injector, write, engine } = setup();
    write.mockClear();
    injector.destroy();
    // Cleanup is explicitly handled here to avoid destroying the injector twice.
    cleanups.splice(0);
    patchState(store, { shared: { count: 5 } });
    expect(write).not.toHaveBeenCalled();
    engine.disconnect();
  });
});
