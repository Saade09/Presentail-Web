# Build and deployment optimization results

**Measured:** 28 August 2026, local Linux x64, Node 24  
**Reference:** `docs/optimization-baseline-2026-08-27.md`

## Before and after

| Measurement                      |                       Before |                        After | Result                                       |
| -------------------------------- | ---------------------------: | ---------------------------: | -------------------------------------------- |
| API build                        |                  2,069.84 ms |                     1,154 ms | 44% faster in this warm local run            |
| Web build                        |                 19,187.58 ms |                    11,337 ms | 41% faster in this warm local run            |
| API runtime artifact             |  18,596,542 bytes / 11 files |    6,992,713 bytes / 6 files | 62% smaller; no maps in serving image        |
| API debugging maps               | included in runtime artifact |    11,786,542 bytes / 5 maps | protected, 30-day Actions artifact           |
| Web artifact                     | 19,219,082 bytes / 421 files | 19,219,082 bytes / 421 files | unchanged; 30 MB budget passed               |
| Clean shared-library build       |                 not isolated |                     9,738 ms | weekly clean-build path added                |
| Local startup failures / retries |                 not recorded |                        0 / 0 | API and web workflows restarted successfully |

Timings vary with workspace contention. The deterministic size and integrity
results are the release gates; the existing baseline comparator remains the
authority for regression enforcement.

## Repeated work avoided

Five workflows previously performed an independent full web build. Exact
content-addressed caches are now shared by compatible Node/OS environments:

- Node 24: web serving and local SEO regression share one verified output.
- Node 20: TestFlight, App Store promotion, and Play Store release share one
  verified output.
- On sequential warm runs this changes five full web builds to two builds and
  three verified cache hits, avoiding up to three repeated builds per revision.
- GitHub summaries report the observed cache hit, build duration, artifact size,
  source hash, output hash, and builds avoided. Actual hosted-run hit rates are
  intentionally left to the existing downstream verification/reporting task.

Shared TypeScript declaration outputs use exact lockfile, source, OS, and Node
keys. Weekly scheduled runs bypass both declaration and web-output caches.

## Release safety

- Restored output is never trusted solely because a cache key matched: source
  and output SHA-256 hashes, runtime compatibility, file count, byte count,
  integrity checks, and size budgets are verified before use.
- Corruption and size-budget negative tests failed with actionable messages.
- The dedicated production workflow compiles and verifies the API, stores
  source maps as a repository-authorized Actions artifact, then runs the locked
  migration. Its green result for the same commit is the pre-publish gate.
- The Replit production build queries GitHub for that exact 40-character commit
  and fails closed unless `db-migrate-prod.yml` has completed successfully.
  Every push to `main` runs the gate, including no-schema-change releases.
- Replit's serving-image build no longer connects to or mutates the production
  database, so an `ALTER TABLE` lock cannot make promotion fail.
- API compilation, artifact verification, and migration report independent
  timings. Runtime provenance rejects `.map` files and an 8 MB size overrun.
- App-store submission, migration, and production SEO operations remain
  non-cancellable; only superseded PR checks are cancelled.

## API release retry and rollback

1. Wait for **DB – Apply schema to production** to pass for the exact commit.
2. If migration fails, the Replit build is mechanically blocked. Fix the
   migration or transient database issue and rerun the workflow with
   `force_run=true`; the advisory lock and Drizzle's no-change behavior make
   retries safe.
3. If the source-map upload is missing, rerun the workflow rather than
   publishing an undebuggable revision.
4. After the gate passes, publish the API. The Replit build performs compilation
   and runtime-artifact verification only.
5. If startup or health checks fail, keep the previous deployment serving and
   republish the last known compatible commit. Do not attempt an automatic
   destructive schema rollback; author and review a forward-fix migration when
   the database itself must change.

Authorized debugging maps are downloaded from the workflow run's
`api-source-maps-<commit>` artifact. They are content-hashed and retained for
30 days, but are neither copied into `dist` nor served by the API. Access is
controlled by the private repository's GitHub Actions read permissions; it must
remain limited to authorized operators.
