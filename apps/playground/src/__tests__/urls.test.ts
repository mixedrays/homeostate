import { afterEach, describe, expect, it, vi } from "vitest";
import { onPageHost } from "../../shared/urls.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("onPageHost", () => {
  it("points localhost at the host the page was loaded from", () => {
    vi.stubGlobal("location", new URL("http://192.168.1.153:5180/"));

    expect(onPageHost("ws://localhost:9999")).toBe("ws://192.168.1.153:9999/");
    expect(onPageHost("http://localhost:5183/todo")).toBe(
      "http://192.168.1.153:5183/todo",
    );
  });

  it("keeps other hosts and relative paths", () => {
    vi.stubGlobal("location", new URL("http://192.168.1.153:5180/"));

    expect(onPageHost("wss://sync.example.com")).toBe("wss://sync.example.com");
    expect(onPageHost("/react/")).toBe("/react/");
  });

  it("keeps the URL outside a browser", () => {
    expect(onPageHost("ws://localhost:9999")).toBe("ws://localhost:9999");
  });
});
