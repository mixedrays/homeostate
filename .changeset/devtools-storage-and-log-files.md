---
"@homeostate/tool-devtools": minor
---

Add a Storage tab, non-JSON warnings, and log export and import. Pass what `createPersistence`
returned as a source's `persistence` to see how many updates the stored document holds and
their size, compact them, or clear the stored document. The State tab now lists values in
synced keys that are not plain JSON, such as a `Date`, `Map` or class instance, and marks them
in the tree, since the engine does not sync them as they are. The Log tab exports the log as a
JSON file and imports one, so a log recorded elsewhere can be stepped through and restored.
