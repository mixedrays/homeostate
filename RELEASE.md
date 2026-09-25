# Releasing

Each package under `packages/` is versioned and published on its own with
[Changesets](https://changesets.dev), and gets its own `CHANGELOG.md`, tag
(`@homeostate/core@0.1.0`) and GitHub release. Packages under `apps/` are private and are
never versioned or published.

## Flow

1. In the PR with the change, run `pnpm changeset`, pick the changed packages and bump types, and
   write the summary that goes into the changelog. Commit the generated `.changeset/*.md` file.
2. On merge to `main`, the Version Packages workflow opens (or updates) a
   `chore(release): version packages` PR that bumps versions and writes the changelogs.
3. Merge that PR, then locally:

   ```bash
   git switch main && git pull
   pnpm release
   ```

   `pnpm release` builds and tests the packages, publishes every version not yet on npm, pushes
   the tags and creates a GitHub release per published package with its changelog entry as
   notes. It is safe to rerun after a failure.

## Prerequisites

- `npm login` with an account that can publish to the `@homeostate` scope.
- `gh auth login`, used to create the GitHub releases.
- The repository setting "Allow GitHub Actions to create and approve pull requests" (Settings →
  Actions → General) stays enabled, or the Version Packages workflow cannot open its PR.

## Dependent packages

Adapters and backends depend on `@homeostate/core` through `workspace:^`, which is published as
`^<core version>`. When a core bump leaves that range, Changesets patch-bumps every dependent so
it is republished against the new core; otherwise only core is released.

In `0.x` a caret range only covers patch versions: `^0.1.0` means `<0.2.0`, and `^0.0.0` means
exactly `0.0.0`. So a minor core release, or any core release while core is at `0.0.x`, releases
every dependent as well.

## Files

| File                            | Runs                        | Does                                                                  |
| ------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `.changeset/config.json`        |                             | Changesets config: public npm access, `main` as base branch           |
| `.github/workflows/ci.yml`      | every PR and push to main   | `format:check`, `lint`, `typecheck`, `test`                           |
| `.github/workflows/version.yml` | push to main                | opens or updates the Version Packages PR                              |
| `scripts/release.sh`            | locally, via `pnpm release` | builds, tests, publishes to npm, pushes tags, creates GitHub releases |

The Version Packages PR is opened with the workflow's own token, and GitHub does not run other
workflows for such PRs, so CI does not run on it. It runs on the push to `main` after the merge.
