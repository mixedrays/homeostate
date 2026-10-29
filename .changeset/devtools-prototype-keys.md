---
"@homeostate/tool-devtools": patch
---

Give keys named after `Object.prototype` members, such as `constructor` or `toString`, the
right status: a store key the backend lacks is `pending` instead of `diverged`, a backend key
the store lacks is `backend-only`, and a replacement or restore without such a key removes it
from the store. Values compare as the sync engine compares them, so a `__proto__` key no longer
makes two values equal. A restore that inserts an item into a list keeps the identity of every
other item, so components showing them do not re-render.
