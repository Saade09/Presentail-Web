---
name: Stale lib/db dist declarations
description: Why tsc can report schema columns as missing even when they exist in src
---
The db package exports point at `src/`, but composite TS project references consume the generated declarations in `lib/db/dist`. When schema columns are added without rebuilding, api-server `tsc --noEmit` reports the columns as nonexistent (e.g. passwordResetToken).
**Why:** dist is emitted by `tsc -b` (emitDeclarationOnly) and is not rebuilt automatically.
**How to apply:** if tsc claims a schema field doesn't exist but `lib/db/src/schema/*.ts` has it, run `npx tsc -b lib/db/tsconfig.json` before hunting for code bugs.
