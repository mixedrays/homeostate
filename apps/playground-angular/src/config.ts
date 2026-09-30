import { InjectionToken } from "@angular/core";

export interface PlaygroundConfig {
  syncServerUrl: string;
  playgroundUrl: string;
}

export const PLAYGROUND_CONFIG = new InjectionToken<PlaygroundConfig>(
  "playground config",
);

export async function loadConfig(): Promise<PlaygroundConfig> {
  const response = await fetch(new URL("config.json", document.baseURI));
  if (!response.ok) throw new Error("Could not load playground configuration.");
  const config: PlaygroundConfig = await response.json();
  const syncUrl = new URL(config.syncServerUrl);
  const playgroundUrl = new URL(config.playgroundUrl, document.baseURI);
  if (
    !["ws:", "wss:"].includes(syncUrl.protocol) ||
    !["http:", "https:"].includes(playgroundUrl.protocol)
  ) {
    throw new Error("Invalid playground URLs in config.json.");
  }
  return { syncServerUrl: syncUrl.href, playgroundUrl: playgroundUrl.href };
}
