---
"@homeostate/core": patch
---

Clean up after a failed connect. When `connect()` throws while subscribing to the backend or
the store, the engine now drops the subscription it already made instead of leaving the backend
listener applying remote changes to a store the engine reports as disconnected. A later
`connect()` subscribes once to each side.
