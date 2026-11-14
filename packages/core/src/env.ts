// Declared here so that core needs no Node types; bundlers replace `process.env.NODE_ENV`.
declare const process: { env: { NODE_ENV?: string } };

// Likewise, as the ES libs have no `console`.
declare const console: {
  error: (...data: unknown[]) => void;
  warn: (...data: unknown[]) => void;
};

/** Whether the app runs a production build, where development warnings stay silent. */
const isProduction = (): boolean => {
  try {
    return process.env.NODE_ENV === "production";
  } catch {
    // No bundler replaced it, and `process` does not exist outside Node.
    return false;
  }
};

/** Logs `error` with `console.error` in every build, after `message` prefixed with `[homeostate]`. */
export const logError = (message: string, error: unknown): void => {
  console.error(`[homeostate] ${message}`, error);
};

/** Logs `message`, prefixed with `[homeostate]`, with `console.warn` unless `isProduction()`. */
export const warnInDevelopment = (message: string): void => {
  if (!isProduction()) console.warn(`[homeostate] ${message}`);
};
