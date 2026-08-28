# Build and deployment optimization results

**Measured:** 28 August 2026, local Linux x64, Node 24  
**Reference:** `docs/optimization-baseline-2026-08-27.md`

## Before and after

| Measurement                      |                       Before |                        After | Result                                       |
| -------------------------------- | ---------------------------: | ---------------------------: | -------------------------------------------- |
| API build                        |                  2,069.84 ms |                     1,154 ms | 44% faster in this warm local run            |
| Web build                        |                 19,187.58 ms |                    11,337 ms | 41% faster in this warm local run            |
| API artifact                     |  18,596,542 bytes / 11 files |  18,596,542 bytes / 11 files | unchanged; 25 MB budget passed               |
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
- API schema migration remains before API compilation, preserving the approved
  production order. Migration and compilation now emit separate stage timings.
- GitHub and Replit production migration paths share a database advisory lock,
  preventing simultaneous `drizzle-kit push` processes.
- The legacy API release path requires an explicit opt-in and retains the same
  migration-before-build behavior.
- App-store submission, migration, and production SEO operations remain
  non-cancellable; only superseded PR checks are cancelled.
