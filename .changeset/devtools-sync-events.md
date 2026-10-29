---
"@homeostate/tool-devtools": minor
---

**Breaking:** `DevtoolsSource` no longer takes `filter`. The devtools ask the source's `engine`
which keys it syncs, so a custom engine filter marks its local keys without being passed twice;
remove `filter` from your sources. A source without an engine treats keys as the default filter
does, as before without `filter`.

The devtools now follow the engine's sync events. A remote change is logged as remote under any
`schedule`, including `requestAnimationFrame` and a `queueMicrotask` engine connected after the
devtools started; before, such changes were logged as local. A `connect()` made by the app is
logged as "Connected: adopted the backend", as one made from the panel was. The connection
status in the status bar and the tabs updates as soon as the engine connects or disconnects,
instead of within a second.
