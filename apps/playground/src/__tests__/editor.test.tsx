// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createStore } from "zustand/vanilla";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createZustandAdapter } from "@homeostate/store-zustand";
import {
  CollaborativeTextarea,
  type RemoteCursor,
} from "../editor/components/CollaborativeTextarea";
import { INITIAL_TEXT, seedDocument, sharedText } from "../editor/document";
import {
  resolveCursor,
  resolveLocalCursor,
  setLocalCursor,
  type Selection,
} from "../editor/presence";
import { SYNC_MAP_NAME } from "../sync";

/** Teardown for whatever the current test opened, run whether it passes or fails. */
const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Carries every update from each document to the other, the way the sync server would. */
const link = (a: Y.Doc, b: Y.Doc) => {
  const relay = Symbol("relay");
  const forward = (to: Y.Doc) => (update: Uint8Array, origin: unknown) => {
    if (origin !== relay) Y.applyUpdate(to, update, relay);
  };
  const toB = forward(b);
  const toA = forward(a);
  a.on("update", toB);
  b.on("update", toA);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), relay);
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b), relay);
  cleanups.push(() => {
    a.off("update", toB);
    b.off("update", toA);
  });
};

/**
 * One tab of the editor, wired like the demo: a store holding the text, synced through
 * homeostate into a seeded document, plus the awareness a provider would carry.
 */
const openTab = () => {
  const doc = new Y.Doc();
  seedDocument(doc);
  const store = createStore<{ text: string }>(() => ({ text: "" }));
  const engine = createSyncEngine(
    createYjsBackend(doc, SYNC_MAP_NAME),
    createZustandAdapter(store),
  );
  engine.connect();
  // Never connected: it is only here for the awareness instance the demo would get from it.
  const provider = new WebsocketProvider("ws://localhost:0", "test", doc, {
    connect: false,
  });
  cleanups.push(() => {
    engine.disconnect();
    provider.destroy();
  });
  return {
    doc,
    text: sharedText(doc),
    awareness: provider.awareness,
    read: () => store.getState().text,
    type: (next: (text: string) => string) =>
      store.setState({ text: next(store.getState().text) }),
  };
};

describe("the shared document", () => {
  it("keeps a room's edits when a new tab joins it, whichever client id sorts last", () => {
    // Each tab seeds before it syncs. Were the seeds separate Y.Texts, the one with the higher
    // client id would win the key and replace the room's text, about one join in two.
    for (let run = 0; run < 32; run++) {
      const room = new Y.Doc();
      seedDocument(room);
      sharedText(room).insert(0, "Edited. ");

      const joining = new Y.Doc();
      seedDocument(joining);
      link(room, joining);

      expect(sharedText(joining).toString()).toBe(`Edited. ${INITIAL_TEXT}`);
      expect(sharedText(room).toString()).toBe(`Edited. ${INITIAL_TEXT}`);
    }
  });

  it("merges what two tabs type at the same time through their stores", () => {
    const a = openTab();
    const b = openTab();
    link(a.doc, b.doc);

    expect(a.read()).toBe(INITIAL_TEXT);
    expect(b.read()).toBe(INITIAL_TEXT);

    a.type((text) => `A: ${text}`);
    b.type((text) => `${text} :B`);

    expect(a.read()).toBe(`A: ${INITIAL_TEXT} :B`);
    expect(b.read()).toBe(a.read());
  });
});

describe("cursors", () => {
  it("keeps a caret on its character while another tab types before it", () => {
    const a = openTab();
    const b = openTab();
    link(a.doc, b.doc);

    const at = INITIAL_TEXT.indexOf("second tab");
    setLocalCursor(a.awareness, a.text, { anchor: at, head: at + 6 });

    b.type((text) => `Hello! ${text}`);

    const moved = { anchor: at + 7, head: at + 13 };
    expect(a.read().slice(moved.anchor, moved.head)).toBe("second");
    // Where this tab puts its own caret back…
    expect(resolveLocalCursor(a.awareness, a.text)).toEqual(moved);
    // …and where the other tab draws it, from the same published position.
    expect(
      resolveCursor(b.text, a.awareness.getLocalState()?.cursor ?? null),
    ).toEqual(moved);
  });

  it("leaves a caret before text another tab types right at it", () => {
    const a = openTab();
    const b = openTab();
    link(a.doc, b.doc);

    const at = INITIAL_TEXT.indexOf("Welcome") + "Welcome".length;
    setLocalCursor(a.awareness, a.text, { anchor: at, head: at });

    b.type((text) => `${text.slice(0, at)}, B${text.slice(at)}`);

    expect(resolveLocalCursor(a.awareness, a.text)).toEqual({
      anchor: at,
      head: at,
    });
  });

  it("clears the published cursor when there is no selection", () => {
    const a = openTab();
    setLocalCursor(a.awareness, a.text, { anchor: 3, head: 3 });
    setLocalCursor(a.awareness, a.text, null);

    expect(a.awareness.getLocalState()?.cursor).toBeNull();
    expect(resolveLocalCursor(a.awareness, a.text)).toBeNull();
  });
});

describe("the collaborative textarea", () => {
  beforeAll(() => {
    // @ts-expect-error React reads this global to decide whether `act` is legal here.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  interface Props {
    value: string;
    cursors?: RemoteCursor[];
    mapSelection?: () => Selection | null;
  }

  const mount = async (initial: Props) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    cleanups.push(async () => {
      await act(async () => root.unmount());
      container.remove();
    });

    const changes: string[] = [];
    const render = (props: Props) =>
      act(async () =>
        root.render(
          <CollaborativeTextarea
            value={props.value}
            cursors={props.cursors ?? []}
            label="Document"
            onChange={(value) => changes.push(value)}
            onSelectionChange={() => {}}
            mapSelection={props.mapSelection ?? (() => null)}
          />,
        ),
      );

    await render(initial);
    const textarea = container.querySelector("textarea")!;
    const overlay = container.querySelector<HTMLElement>("[aria-hidden]")!;
    return { textarea, overlay, render, changes };
  };

  it("puts the caret back where it belongs when text arrives from another tab", async () => {
    const { textarea, render } = await mount({ value: "hello world" });
    textarea.focus();
    textarea.setSelectionRange(6, 6);

    await render({
      value: "Oh, hello world",
      mapSelection: () => ({ anchor: 10, head: 10 }),
    });

    expect(textarea.value).toBe("Oh, hello world");
    expect(textarea.selectionStart).toBe(10);
    expect(textarea.selectionEnd).toBe(10);
  });

  it("restores a backward selection with its direction", async () => {
    const { textarea, render } = await mount({ value: "hello world" });
    textarea.focus();

    await render({
      value: "hello, world",
      mapSelection: () => ({ anchor: 12, head: 7 }),
    });

    expect(textarea.selectionStart).toBe(7);
    expect(textarea.selectionEnd).toBe(12);
    expect(textarea.selectionDirection).toBe("backward");
  });

  it("leaves the textarea alone when the value is what this tab typed", async () => {
    let mapped = 0;
    const { textarea, render, changes } = await mount({ value: "hello" });
    textarea.focus();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(textarea, "hello!");
      textarea.setSelectionRange(6, 6);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(changes).toEqual(["hello!"]);

    await render({ value: "hello!", mapSelection: () => (mapped++, null) });

    // The browser already holds this text and its caret; nothing was rewritten or moved.
    expect(mapped).toBe(0);
    expect(textarea.selectionStart).toBe(6);
  });

  it("draws other writers' carets and selections over the same text", async () => {
    const { overlay } = await mount({
      value: "hello world",
      cursors: [
        { id: 1, name: "Ada", color: "#2563eb", anchor: 0, head: 5 },
        { id: 2, name: "Grace", color: "#dc2626", anchor: 8, head: 8 },
      ],
    });

    const carets = [...overlay.querySelectorAll("[data-caret]")];
    expect(carets.map((caret) => caret.textContent)).toEqual(["Ada", "Grace"]);
    expect(overlay.querySelector('[data-selection="1"]')?.textContent).toBe(
      "hello",
    );
    // Grace has a caret but nothing selected.
    expect(overlay.querySelector('[data-selection="2"]')).toBeNull();

    // Without the labels, the overlay holds exactly the textarea's text, so it wraps the same.
    for (const caret of carets) caret.remove();
    expect(overlay.textContent).toBe("hello world ");
  });
});
