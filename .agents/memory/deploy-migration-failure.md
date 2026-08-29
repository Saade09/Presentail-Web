---
name: Deployment failure on schema migration
description: Production schema locks can fail promotion; migration is now an exact-commit GitHub pre-deploy gate, never a Replit build step.
---

## The rule
Never apply production schema changes from a Replit artifact build or an automatic post-merge hook. Production migration must complete in the dedicated GitHub pre-deploy workflow, and the serving-image build must verify that workflow's migration job and step succeeded for its exact commit.

**Why:** `ALTER TABLE` can take an ACCESS EXCLUSIVE lock. When migration ran during publishing, the live service became temporarily unresponsive and promotion failed even though the image built successfully.

**How to apply:** Make the migration workflow run for every production revision. Fail closed unless the exact revision has a successful migration job and schema-push step. Keep retries idempotent and use a reviewed forward-fix rather than automatic destructive rollback.

Source maps follow the same release gate: store them as a repository-authorized debug artifact and forbid them from the serving image.
