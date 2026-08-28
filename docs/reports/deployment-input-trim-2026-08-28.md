# Deployment input trim — 2026-08-28

## Classification and retention

| Class | Decision | Reason / retrieval path |
| --- | --- | --- |
| `artifacts/presentail/assets/**` | Keep as deployment input | Mobile source assets referenced by the Expo application. |
| `artifacts/presentail-web/src/assets/**` and `public/**` | Keep as deployment inputs | Web bundle and public runtime assets. |
| Nine imported files in `attached_assets/` | Keep as deployment inputs | Direct `@assets` imports used by the web logo and cart stationery. |
| `attached_assets/play-store/**` | Keep as deployment input | Intentional App Store / Play Store release media. |
| Remaining `attached_assets/**` | Exclude from deployment | Historical uploads, screenshots, recordings, handoff files, audit exports, and image-search/generation history. They remain retrievable from the repository checkout and Git history. |
| `screenshots/**` and `artifacts/presentail-web/screenshots/**` | Exclude from deployment | Historical visual QA evidence; not referenced by runtime, test, or release code. |
| `tmp-dist/**` | Exclude from deployment | Temporary output. Its only file duplicates the canonical mobile hero source asset. |
| `artifacts/presentail/static-build/**` | Exclude from deployment inputs | Reproducible output: the mobile artifact's build command deletes and recreates this directory before it is served. |
| `public/blog/*-480.webp` and `*-768.webp` | Exclude from deployment inputs and provenance | Reproducible responsive derivatives generated and checked at the start of every web build; original blog hero images remain source inputs. |

The exclusions use `.gitignore`, which Replit publishing respects when assembling
deployment context. No Object Storage data or customer-facing product imagery was
deleted or moved.

## Before / after measurements

The baseline was captured before the change and the final measurement after the
change on 2026-08-28. (Other task merges landed during validation, so tracked
checkout totals include those concurrent additions.) Byte counts are
uncompressed file bytes.

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Repository/deployment candidates | 4,540 files / 371,209,366 bytes | 4,545 tracked files / 371,247,721 bytes | Historical material remains retrievable |
| Publish context after `.gitignore` | 4,540 files / 371,209,366 bytes | 2,073 files / 69,899,109 bytes | 2,467 files / 301,310,257 bytes (81.2% by bytes) |
| Web provenance inputs | 3,557 files / 332,798,325 bytes | 540 files / 27,312,112 bytes | 3,017 files / 305,486,213 bytes (91.8% by bytes) |
| Web provenance create duration | 10,462 ms | 382 ms | 10,080 ms (95.6%) |

The post-change provenance list contains only web source/public/build-pipeline
files, the workspace libraries imported by web, root dependency/configuration
files, and the nine directly imported attachment assets. CI cache keys mirror
the narrowed web, generated-variant, and attachment boundaries.

## Artifact integrity

The production web build completed, generated/checked all 24 responsive blog
hero variants, compressed assets, and passed build-integrity and provenance
verification.

- Emitted files: **421**
- Emitted bytes: **19,219,588**
- Output SHA-256: `31439a7886d8d272ad297c4b83809ac64477c2a2696ff376031b59a3d712df96`
- Source SHA-256: `e16bc2f3eeda604b37f79d200cec03332b7c80fe49115ce416b8e37912a83ec2`
- Size budget: **passed** (`19,219,588 < 30,000,000`)

Additional checks passed:

- all nine `@assets` imports exist and remain included in deployment context;
- generated mobile, temporary, and blog-variant paths are excluded;
- mobile TypeScript and shared-library build checks;
- public image budgets and responsive blog hero integrity.