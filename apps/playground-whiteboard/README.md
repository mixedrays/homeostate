# @homeostate/playground-whiteboard

Private React + Vite + Tailwind + shadcn/ui playground: one shared whiteboard. Draw boxes,
arrows and text, recolour them, and see everyone else's named cursor move. Each tab joins
under a name, or anonymously under a generated one. The board mounts
`@homeostate/tool-devtools`, opened with **Inspect state** in the header or the round button
in the corner.

```bash
pnpm playground:whiteboard   # http://localhost:5184, with the WebSocket server
```

## How it syncs

The board is a Zustand store holding `{ shapes: Record<id, Shape> }`, synced by homeostate
into the room `homeostate-whiteboard-v1`. Keying shapes by id means tabs adding or deleting
shapes at once touch separate keys, and two edits to one shape merge field by field: a move
and a recolour made at the same time both stay.

Colours are palette indexes, not strings. Homeostate syncs strings as `Y.Text` and merges them
character by character, which suits a text being typed but would blend two colours picked at
once into an invalid one. A number is replaced whole.

Names, pointers and selections are not board state: they travel over Yjs awareness and vanish
with the tab. A tab that has not joined yet sends no presence, so nobody sees it.

Every tab applies the same seed update for the starting shapes before it connects (see
[`src/board/shapes.ts`](src/board/shapes.ts)). If you change `INITIAL_SHAPES`, bump the room
version in [`src/sync.ts`](src/sync.ts). See the [playground README](../playground/README.md)
for configuration and deployment.

## Using it

| Key          | Action                                     |
| ------------ | ------------------------------------------ |
| `V`          | Select and move; drag handles to resize    |
| `R`          | Box: drag to size it, or click for default |
| `A`          | Arrow: drag from tail to head              |
| `T`          | Text: click to place, then type            |
| Double-click | Edit a text, or write a new one anywhere   |
| `Delete`     | Delete the selected shape                  |
| `Esc`        | Deselect, or finish editing a text         |
