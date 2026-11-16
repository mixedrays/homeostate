---
"@homeostate/crdt-yjs": patch
---

An engine that connects while an update waits for an earlier one no longer writes the store's
old value over the waiting update. When a provider delivered a peer's update before one it
depends on, a backend no engine was subscribed to read the map without the values the waiting
update replaced, so `connect()` seeded the store's values for those keys. That write was
concurrent with the waiting update, and about half the time, by client ID, the old value won on
every replica. A backend that read or wrote the map after the map's last change before the
waiting update now shows that content while unsubscribed too, as it does while subscribed, so
reconciliation writes nothing over a hidden key, and the subscription it starts keeps showing
that content until the earlier update arrives. A backend with no such content, as one created
during the wait or after a peer changed the map while the engine was disconnected, still reads
the map as it is; pass `seed: false` to the engine to avoid the seeding there.
