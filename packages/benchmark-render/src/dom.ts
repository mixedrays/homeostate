import { JSDOM } from 'jsdom';

/**
 * Tells React that `act` is allowed to flush work synchronously. Vitest's jsdom environment
 * does not set it, so both the CLI and the test suite ask for it explicitly.
 */
export const enableActEnvironment = (): void => {
  (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
};

/**
 * Gives Node the DOM globals `react-dom` expects. Call it before importing anything that
 * touches the DOM: React decides once, at module scope, whether it is running in a browser.
 * Under Vitest the `@vitest-environment jsdom` docblock does the same job, so the test suite
 * does not call this.
 */
export const installDom = (): void => {
  const { window } = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
  });
  const global = globalThis as unknown as Record<string, unknown>;

  global.window = window;
  global.document = window.document;

  for (const key of Object.getOwnPropertyNames(window)) {
    if (key.startsWith('_') || key in global) continue;
    try {
      global[key] = (window as unknown as Record<string, unknown>)[key];
    } catch {
      // A handful of window properties throw when read outside a browsing context; React
      // needs none of them.
    }
  }

  enableActEnvironment();
};
