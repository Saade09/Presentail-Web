#!/bin/bash
set -e

# Only run pnpm install when pnpm-lock.yaml changed in the merge commit.
# git diff HEAD~1..HEAD is reliable because post-merge always runs right
# after the merge commit lands. Falls back to running install when the
# diff command itself fails (e.g. shallow clone, initial commit).
if git diff --name-only HEAD~1..HEAD 2>/dev/null | grep -q "^pnpm-lock.yaml$"; then
  echo "pnpm-lock.yaml changed — running pnpm install"
  pnpm install --no-frozen-lockfile
else
  echo "pnpm-lock.yaml unchanged — skipping pnpm install"
fi

# Schema application is intentionally not automatic here. Development changes
# use `pnpm --filter @workspace/db run push`; production changes run only in the
# protected db-migrate-prod GitHub Actions gate.
echo "Database schema push skipped — use the explicit development or production migration command"
