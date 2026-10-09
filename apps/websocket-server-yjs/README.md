# @homeostate/websocket-server-yjs

Private y-websocket server for the playgrounds, on `ws://localhost:9999` by default.
`pnpm playground` and `pnpm dev` start it too.

```bash
pnpm --filter @homeostate/websocket-server-yjs start   # or dev, with auto-reload
PORT=8080 pnpm --filter @homeostate/websocket-server-yjs start
```

Clients connect with `y-websocket`; each room name is a separate document:

```ts
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

const ydoc = new Y.Doc();
const provider = new WebsocketProvider("ws://localhost:9999", "my-room", ydoc);
```
