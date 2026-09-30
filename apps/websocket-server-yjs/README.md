# @homeostate/websocket-server-yjs

A simple WebSocket server for Yjs document synchronization, used by the playgrounds.

## Usage

Install dependencies from the workspace root with `pnpm install`, then:

```bash
pnpm --filter @homeostate/websocket-server-yjs start
# or with auto-reload:
pnpm --filter @homeostate/websocket-server-yjs dev
```

`pnpm playground` at the workspace root starts this server together with every playground.
`pnpm dev` starts it too, along with every other app's dev server.

The server listens on `ws://localhost:9999` by default.

## Configuration

Change the port with the `PORT` environment variable:

```bash
PORT=8080 pnpm --filter @homeostate/websocket-server-yjs start
```

## Connecting from clients

```typescript
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

const ydoc = new Y.Doc();
const wsProvider = new WebsocketProvider(
  "ws://localhost:9999",
  "my-room-name",
  ydoc,
);
```

Different room names sync to different documents.
