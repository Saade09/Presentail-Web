---
name: Deployment failure on schema migration
description: Every publish that runs ALTER TABLE customers fails at the promote step; retry after migration is already applied succeeds.
---

## The rule
Any deploy whose `push-force` step applies an `ALTER TABLE` on the `customers` table will fail at the promote/health-check step. Subsequent deploys (no pending migrations) succeed immediately.

**Why:** `ALTER TABLE … ADD COLUMN` takes an ACCESS EXCLUSIVE lock. While the lock is held, Replit's deployer (monitoring the live server) detects the running service as unresponsive and marks the promotion failed. The build itself always succeeds; the image is pushed; the failure comes ≈2 s after "Pushed image manifest".

**Pattern observed:**
- `[✓] Changes applied` in build logs → deploy fails
- `[i] No changes detected` in build logs → deploy succeeds

## Immediate workaround
Publish again right after a failed migration build. The migration was already committed to the DB (`[✓] Changes applied` is definitive); the next build shows `[i] No changes detected` and succeeds.

## Long-term fix
Pre-apply all DB migrations via the GitHub Actions workflow **"DB – Apply schema to production"** *before* publishing. Steps:
1. GitHub → Actions → "DB – Apply schema to production"
2. Run workflow, set "Confirm" = true
3. Then publish from Replit — `push-force` will see no diff and skip the ALTER TABLE

This decouples migrations from deploys so the live server is never stalled by a lock during a build.
