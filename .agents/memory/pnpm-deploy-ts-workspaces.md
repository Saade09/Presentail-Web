---
name: pnpm deploy with TypeScript workspace packages
description: Runtime staging caveat for workspace packages that export TypeScript source
---

`pnpm deploy --prod --legacy` copies file-linked workspace packages beneath
`node_modules`. Node 24 refuses to strip types from TypeScript files at that
location, even though the same package works through a normal workspace symlink
whose real path is outside `node_modules`.

**Why:** A production-only web staging check failed with
`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` for workspace libraries that
export `src/index.ts`; relinking those packages to copied workspace directories
outside `node_modules` made the same staged server start successfully.

**How to apply:** When measuring or testing production-only deploy trees, keep
TypeScript-exporting workspace libraries outside `node_modules` and link to
them, or compile/package them to JavaScript before staging. Do not interpret the
raw legacy-deploy failure as a missing runtime dependency.