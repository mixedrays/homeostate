---
"@homeostate/tool-devtools": minor
---

Add `mountDevtools` in `@homeostate/tool-devtools/mount`, to use the devtools from Angular,
Vue, Svelte or no framework. It takes the component's props as options and returns `update`
and `unmount`. The panel brings its own React and loads in the background, so the app needs no
React. `react` and `react-dom` are now optional peer dependencies, needed only for the
component.
