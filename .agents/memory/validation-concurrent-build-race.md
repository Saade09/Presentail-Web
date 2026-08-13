---
name: Validation concurrent-build race
description: compression-check and check-social-share-previews race on presentail-web dist/, causing flaky validation failures
---

Validation runs all commands concurrently. `compression-check` and `check-social-share-previews` each run `pnpm --filter @workspace/presentail-web run build`, and the build starts with `rmSync('dist')` — so parallel runs wipe each other's output mid-build.

**Symptoms:** missing `.br` files during compress-assets, `site.webmanifest` missing (build integrity), `SyntaxError: Unexpected end of JSON input` reading `.vite/manifest.json`, ENOENT during `public/` copy, or bogus "API server did not start on :8080".

**Why:** shared `dist/` output directory, no serialization between validation commands.

**How to apply:** when validation fails in these two checks after an unrelated change, re-run each command serially in the shell; if both pass, use `skip_validation_reason` documenting the race. A real fix would serialize the builds or give them separate out dirs.
