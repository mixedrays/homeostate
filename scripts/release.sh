#!/usr/bin/env bash
# Publishes every package whose version is not on npm yet, pushes the new tags and creates one
# GitHub release per published package, with its CHANGELOG entry as the notes.
# Run on main after merging the "Version Packages" PR and pulling it.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(git branch --show-current)" != main ]]; then
  echo "Release from main." >&2
  exit 1
fi

git fetch --quiet origin main
if ! git diff --quiet HEAD || [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "main must be clean and match origin/main: commit, push or pull first." >&2
  exit 1
fi

# Clean build so files deleted from src do not linger in dist and get published.
rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo
pnpm --filter './packages/*' run build
pnpm test

pnpm changeset publish
git push --follow-tags

for tag in $(git tag --list --points-at HEAD '@homeostate/*@*'); do
  if gh release view "$tag" >/dev/null 2>&1; then
    continue
  fi
  name="${tag%@*}"
  version="${tag##*@}"
  dir="$(pnpm --filter "$name" exec pwd)"
  notes="$(awk -v heading="## $version" '$0 == heading { found = 1; next } found && /^## / { exit } found' "$dir/CHANGELOG.md")"
  gh release create "$tag" --verify-tag --title "$tag" --notes "$notes"
done
