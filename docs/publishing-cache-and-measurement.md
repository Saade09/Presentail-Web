# Cached publishing and phase measurement

The production artifact commands use `scripts/publish-artifacts.mjs`. A
multi-artifact publish runs shared TypeScript library validation once, then
runs the API, web, and mobile typechecks and integrity checks independently.
An artifact cache hit skips only its build; it never skips validation.

## Commands

```sh
# All artifacts, using verified cache entries when available
pnpm run publish:artifacts

# One artifact
pnpm run publish:artifacts -- --artifact web

# Force a clean build and replace the matching cache entries
pnpm run publish:artifacts -- --clean

# Recovery mode: neither read nor write artifact cache entries
pnpm run publish:artifacts -- --no-cache

# Compare this publish with an earlier structured report
pnpm run publish:artifacts -- \
  --report /tmp/publish-warm.json \
  --compare /tmp/publish-clean.json
```

`PUBLISH_CLEAN=1` and `PUBLISH_CACHE_BYPASS=1` are the environment equivalents
of `--clean` and `--no-cache`. `PUBLISH_CACHE_DIR` moves the cache without
mixing it with output directories. The default is
`.cache/publish-artifacts`; pnpm's store, TypeScript build information, Vite's
cache, and Metro's cache remain separate. Artifact builds may delete `dist/`
or `static-build/` without deleting those reusable layers.

The production environment normally installs dependencies before running an
artifact build, so the `install` phase is recorded as skipped rather than
inventing a duration. Use `--install` (or `PUBLISH_RUN_INSTALL=1`) when the
coordinator owns installation and should measure `pnpm install
--frozen-lockfile`.

## Cache trust and invalidation

Each API, web, and mobile key contains:

- the artifact's relevant tracked and untracked source files;
- only the workspace libraries consumed by that artifact;
- the lockfile, workspace configuration, root TypeScript configuration, and
  provenance implementation;
- Node version, operating system, CPU architecture, public build environment,
  and artifact build configuration.

The API, web, and mobile cache namespaces are independent. A web-only source
change therefore leaves API and mobile keys unchanged. A shared library change
invalidates only artifacts that list that library as an input.

Cache entries are written through a temporary directory and atomically renamed
after a successful build and verification. Restore is accepted only after the
embedded provenance manifest re-hashes current inputs and every output file,
checks the runtime environment and output policy, and runs the artifact's own
integrity check. A rejected entry is deleted and rebuilt automatically.

## Timing records

Every phase writes one JSON line with `event: "publish_phase"`. The final report
contains distinct records for:

- dependency install;
- shared and artifact-specific validation;
- artifact build;
- bundle/post-processing and provenance verification;
- context packaging;
- image push;
- startup; and
- health check.

Context packaging, image push, startup, and health checking are owned by the
hosting publish system and are recorded as `skipped` with `not_exposed` when it
does not provide a local hook. If those stages are exposed, set
`PUBLISH_CONTEXT_PACKAGING_COMMAND`, `PUBLISH_IMAGE_PUSH_COMMAND`,
`PUBLISH_STARTUP_COMMAND`, and `PUBLISH_HEALTH_URL` respectively. A skipped
phase is not reported as a zero-duration measurement.

Reports include total duration, per-artifact bytes/file counts/output hashes,
cache-hit rate, and estimated compute milliseconds avoided. The estimate is
the previously measured build duration for each verified hit. It is not a
billing estimate and no dollar value or hosted infrastructure rate is inferred.

## Representative clean/warm result

Measured on 29 August 2026 in the same Replit Linux x64 workspace with Node 24.
Both runs selected API, web, and mobile in one coordinator process. These are
local elapsed times, not hosted billing measurements.

| Measurement | Clean | Warm verified cache | Change |
| --- | ---: | ---: | ---: |
| Total publish time | 138,507 ms | 51,850 ms | 86,657 ms faster (62.6%) |
| Artifact cache-hit rate | 0/3 (0%) | 3/3 (100%) | +100 percentage points |
| Build work avoided | 0 ms | 96,459 ms estimated | API + web + mobile measured build phases |
| API output | 6,988,759 bytes / 6 files | same, verified | no size change |
| Web output | 19,250,399 bytes / 421 files | same, verified | no size change |
| Mobile output | 73,904,783 bytes / 242 files | same, verified | no size change |

The avoided build-phase sum is larger than the wall-clock improvement because
warm restores still pay for artifact-specific typechecks, copying, hashing, and
integrity verification. A web-only source probe changed only the web cache key;
the API and mobile keys remained identical. Shared library validation appeared
once in each multi-artifact report.

## Rollback and recovery

1. If a cache entry is rejected, let the coordinator rebuild it. The failed
   entry is removed without deleting other keys for that artifact.
2. For suspected cache behavior, publish once with `--no-cache`. This proves
   the source and artifact pipeline independently and does not overwrite the
   cache.
3. To refresh known-good entries, publish with `--clean`.
4. To roll back a release, select the previous Replit deployment/checkpoint.
   Artifact caches are only build accelerators; they do not change deployment
   routing, autoscale settings, database state, or runtime behavior.
5. Never copy an output directory manually into a release. Rebuild or restore
   through the coordinator so source, environment, and output integrity remain
   verified.