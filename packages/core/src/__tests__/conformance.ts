/**
 * The contract suites and the fixtures they share, imported as `@homeostate/core/conformance`
 * by this repository's own tests. It is a development-only entry: `publishConfig.exports` leaves
 * it out, and `files` leaves out every `__tests__` folder, so it is never published.
 */
export * from "./helpers.js";
export * from "./crdt-backend-suite.js";
export * from "./persistable-doc-suite.js";
export * from "./persistence-adapter-suite.js";
