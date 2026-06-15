#!/bin/bash
set -e

# Only run pnpm install when the lockfile has actually changed.
# This keeps the post-merge setup well under the 20 s budget for
# schema-only or code-only merges, while still installing on the
# rare occasions a task adds or upgrades a dependency.
LOCKFILE="pnpm-lock.yaml"
STAMP="/tmp/.post-merge-lockfile-hash"

CURRENT_HASH=$(md5sum "$LOCKFILE" 2>/dev/null | awk '{print $1}' || echo "none")
STORED_HASH=$(cat "$STAMP" 2>/dev/null || echo "")

if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
  echo "lockfile changed — running pnpm install"
  pnpm install --no-frozen-lockfile
  echo "$CURRENT_HASH" > "$STAMP"
else
  echo "lockfile unchanged — skipping pnpm install"
fi

pnpm --filter @workspace/db run push
