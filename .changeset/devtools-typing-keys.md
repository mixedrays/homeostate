---
"@homeostate/tool-devtools": patch
---

Keep keys typed into a devtools field from reaching the page's own keyboard shortcuts. Past the
devtools' shadow root a key event's target is the host element, so a page that ignores keys typed
into inputs could not tell and acted on them: Backspace deleted the page's selection instead of a
character. Escape and Tab still reach the page.
