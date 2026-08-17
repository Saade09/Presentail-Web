---
name: Task-agent splice corruption in api-server routes
description: How to detect and fix spliced/corrupted handler bodies that pass esbuild but crash at runtime
---

Task-agent merges have repeatedly left corrupted handler bodies in `artifacts/api-server/src/routes/*` — code referencing variables from a *different* handler (e.g. `gulf`/`row`/`rawTotalUsd`/`brandSlug`/`parsed` undefined in scope, or wrong schema like a search schema parsing an order body).

**Why:** The api-server build uses esbuild (`node ./build.mjs`), which does NOT type-check. Undefined identifiers ship silently and only fail as runtime `ReferenceError`s — surfacing as 500s ("Card payments aren't available right now", "Invalid order payload").

**How to apply:**
- After any task-agent merge touching api-server routes, run `pnpm --filter @workspace/api-server exec tsc --noEmit` and fix all TS2304/TS2552 (cannot find name) errors before trusting the build.
- Runtime symptom pattern: endpoint 500s with `ReferenceError: X is not defined` in workflow logs; grep logs for `ReferenceError`.
- Fix by reading the analogous working handler in the same file (the variable names usually reveal which handler the splice came from).
- Fast recovery when the splice landed in a rebase/merge commit: find the clean pre-rebase commit in `git reflog` (entry just before "rebase (start)"), `git checkout <that-commit> -- <spliced files>`, then re-apply main's (usually tiny) delta from `git diff <merge-base> <main> -- <files>`. Verifies far faster than hand-repairing spliced hunks.

Also durable: the main Stripe account is a **Cyprus** account that accepts ALL display currencies; only AED routes to the Gulf account. Never restrict the main account's charge currencies.
