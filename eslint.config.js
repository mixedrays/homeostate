import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist",
      "**/node_modules",
      "apps/docs/build",
      "**/.react-router",
      "**/.angular",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: [
      "apps/playground-react/**/*.{ts,tsx}",
      "apps/benchmark-ui/**/*.{ts,tsx}",
      "apps/docs/**/*.{ts,tsx}",
      "packages/tool-devtools/**/*.{ts,tsx}",
    ],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: [
      "apps/*/src/components/ui/**/*.tsx",
      "packages/tool-devtools/src/components/ui/**/*.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // React Router route modules export loader, meta, links and ErrorBoundary next to the component.
    files: ["apps/docs/src/routes/**/*.tsx", "apps/docs/src/root.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // Build-time code: the content pipeline, routes.ts, configs and scripts run in Node.
    files: [
      "apps/docs/src/content/**/*.ts",
      "apps/docs/src/routes.ts",
      "apps/docs/scripts/**/*.ts",
      "apps/docs/*.ts",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["apps/benchmark-crdt/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Fixtures render React in jsdom and the CLI drives them from Node, so both sets apply.
    files: ["apps/benchmark-store/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["apps/websocket-server-yjs/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
);
