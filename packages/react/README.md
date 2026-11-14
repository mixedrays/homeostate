# @homeostate/react

[![npm](https://img.shields.io/npm/v/@homeostate/react?color=2563eb)](https://www.npmjs.com/package/@homeostate/react)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Freact?externals=@homeostate/core,react&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Freact&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%2C%22react%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/react?color=2563eb)](https://www.npmjs.com/package/@homeostate/react)
[![license](https://img.shields.io/npm/l/@homeostate/react?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/react/LICENSE)

React hook for the status of a sync engine from
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core). Apps that
don't use React don't need this package, and core loads no React code.

## Install

```bash
npm install @homeostate/react
```

It needs React 18 or 19, as a peer dependency. The project's CI runs React 19 only.

## Usage

```tsx
import { useSyncStatus } from "@homeostate/react";
import { useTodoStore } from "./store";

function Editor() {
  const { connected, failure } = useSyncStatus(useTodoStore.homeostate);

  return (
    <>
      {failure && <p role="alert">The last change did not sync.</p>}
      <textarea disabled={!connected} />
    </>
  );
}
```

The component re-renders when the status changes, not on every local or remote change.

The status describes the engine and says nothing about the network: `connected` stays `true` while
the sync server is down. Read the provider's own state to show whether a peer is online. See the
[docs](https://homeostate.pages.dev/docs/react/introduction) for what each field means, and which
engines you can pass.
