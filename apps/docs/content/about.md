---
description: What Homeostate is, where its code and packages live, and how these docs are published.
order: 100
---

# About

Homeostate keeps a store you already use in sync with a CRDT document. It is one sync engine,
[`@homeostate/core`](../../../packages/core/docs/introduction.md), plus a store adapter per state
manager and a backend per CRDT library, each published as its own package.

- **Source:** [github.com/mixedrays/homeostate](https://github.com/mixedrays/homeostate), a pnpm
  workspace with every package, the playground and the benchmarks. Issues and pull requests go
  there.
- **Packages:** [npmjs.com/org/homeostate](https://www.npmjs.com/org/homeostate). Each package is
  versioned and released on its own; its changelog is the last page of its section.
- **License:** MIT.

## These docs

Every page is a markdown file in the repository: package pages live in each package's `docs/`
folder, next to the code, and guides like this one in `apps/docs/content/`.

Add `.md` to any page's URL for its plain markdown. [llms.txt](/llms.txt) indexes every page, and
[llms-full.txt](/llms-full.txt) has all of them in one file.
