---
"@homeostate/store-mobx-state-tree": minor
---

Add the `onInvalidSnapshot` option to `syncStateTree` and `createMobxStateTreeAdapter`, for a
remote state that does not fit the node's type, such as one a peer on another version of the
model sends. With it, the adapter checks each remote state against the node's type before
`applySnapshot`, in every build, whatever MST's type checking is set to, and never applies an
invalid state, not even its valid parts. `"throw"` throws MST's type check error, which the
engine hands to `onError` with the source `"store"`, or which reaches the provider without
`onError`; `connect()` throws it. `"skip"` leaves the node as it is. A function is called with
MST's validation errors and the state, and leaves the node as it is; what it throws goes where
`"throw"`'s error goes. The error type is exported as `SnapshotValidationError`, and the options
type as `MobxStateTreeAdapterOptions`.

Without the option nothing changes: in development `applySnapshot` throws, and with type checking
disabled, as in production, it applies the state unchecked. A state the node rejects, with or
without the option, stays in the room, and the next local change writes the node's state over it,
losing the peer's changes; peers on different versions of the model need a migration strategy.
