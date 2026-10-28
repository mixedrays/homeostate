---
"@homeostate/store-zustand": minor
---

**Breaking:** the `homeostate` middleware takes the state creator first and its options
second, as Zustand's own middlewares do. `homeostate(creator, { backend, ...config })`
replaces `homeostate(backend, creator, config)`: move the backend into the options, next to
`filter`, `seed`, `schedule` and `onError`. With `persist`, write
`homeostate(persist(creator, options), { backend })`. Calling the middleware with the backend
first throws a `TypeError` naming the new order. The options type is exported as
`HomeostateOptions`.

`connect: "manual"` creates the store without reading or writing the backend and leaves
`store.homeostate.connect()` to the app, for example once its provider has received the
room's state or its document persistence has loaded. A `store.homeostate.connect()` made
before `persist` has hydrated the store waits for the hydration, with either connect mode,
instead of connecting at once.
