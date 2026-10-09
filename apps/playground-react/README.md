# @homeostate/playground-react

Private React + Vite playground: a todo demo for each of the seven React store adapters and a
collaborative text editor. Its landing page also links to the
[whiteboard](../playground-whiteboard/README.md), a React app built on its own. Every demo
mounts `@homeostate/tool-devtools`, opened with **Inspect state** in the header or the round
button in the corner.

```bash
pnpm playground:react   # http://localhost:5181, with the whiteboard and the WebSocket server
```

The todo demos share their room with the other playgrounds; the editor uses a room of its
own. See the [playground README](../playground/README.md) for configuration, deployment and
how the room is seeded.
