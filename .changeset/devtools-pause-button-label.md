---
"@homeostate/tool-devtools": patch
---

Drop `aria-pressed` from the Log tab's Pause/Resume button. Its label already names the next
action, so while recording was paused a screen reader announced "Resume, pressed".
