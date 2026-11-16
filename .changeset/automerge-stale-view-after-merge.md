---
"@homeostate/crdt-automerge": patch
---

Document a known Automerge issue: on `@automerge/automerge` 3.4.1 and 3.5.0, a merge that brings
a delete of a list item together with an insert after it, while another peer's concurrent update
of that item is in the same merge or already in the document, leaves the inserted item one index
too low in the document's view. The backend reads that view, so the affected peer's store shows
another list order than the other peers, with no error, and its next edit by index changes
another item for every peer. The README and the docs describe the merge, the symptom and how to
recover. The backend does not work around it yet.
