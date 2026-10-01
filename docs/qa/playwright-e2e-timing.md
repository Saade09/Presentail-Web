# Is the Playwright e2e job timing out? (diagnostic report)

Requested by Lea Farah (QA). **Diagnostic only.** No workflow, test, Playwright
config, Vite config or application code was changed. This file is the only change.

Job: **"Playwright – currency & checkout flow"**, `.github/workflows/web-e2e.yml`,
job `web-e2e`, `timeout-minutes: 15`.

## Direct answer

**Not proven either way. The logs could not be read from this environment (see
"What I could NOT verify").** The evidence points to two separate problems:

- **PR #4 (CANCELLED, 15m16s): almost certainly a job timeout (i).** It can't be a
  concurrency cancellation (iv), because `web-e2e.yml` has no `concurrency:` block.
- **PRs #9, #10, #11 (FAILED): not a job timeout.** A job that hits
  `timeout-minutes` reports as *cancelled*, not *failed*. In these runs a step
  exited non-zero inside the 15 minutes. That is most likely the Playwright step,
  with test failures: either real assertions (iii) or per-test 30 s timeouts (ii).
  Which of the two, and which tests, is still unconfirmed.

All four PRs branch from the same `main` commit (`799c3f24`). None of them changes
anything under `artifacts/presentail-web/e2e/`, `playwright.config.ts` or
`lib/display-currency/` (checked with `git diff --stat main...pr<N>`). So the same
suite timed out once and failed three times. The likely story is a suite that
**fails on `main`** and **runs close to the 15-minute cap**. In that situation,
raising `timeout-minutes` alone would turn the CANCELLED result into FAILED and
nothing more. The failures have to be read and fixed first.

## Runs inspected

| Run id | PR / branch | Conclusion | Duration | Failing step | Decisive log line |
|---|---|---|---|---|---|
| not retrieved | PR #4 | CANCELLED (from the statusCheckRollup in `docs/qa/ci-baseline-main.md`) | 09:36:32 → 09:51:48 = **15m16s** | not retrieved | **Not read.** Expected wording if it is a job timeout: `The job running on runner … has exceeded the maximum execution time of 15 minutes.` |
| not retrieved | PR #9 | FAILED (as reported in the task brief) | not retrieved | not retrieved | **Not read** |
| not retrieved | PR #10 | FAILED (as reported in the task brief) | not retrieved | not retrieved | **Not read** |
| not retrieved | PR #11 | FAILED (as reported in the task brief) | not retrieved | not retrieved | **Not read** |
| — | `main` | not retrieved | — | — | — |

Why every cell says "not retrieved": in this session, every route to the Actions
API was refused by the agent's permission layer with "This command requires
approval". That covers `gh run list`, `gh run view`, `gh api …/actions/…`, a plain
`curl https://api.github.com/…` and fetching the Actions web page. No log line
above is quoted, because quoting a line I didn't read would be invented evidence.

How the four outcomes could be told apart once someone has log access:

| Cause | What the run shows |
|---|---|
| (i) Job timeout | Job conclusion `cancelled`, duration ≈ 15m + a few seconds, annotation `has exceeded the maximum execution time of 15 minutes`. The "Upload Playwright report" step is **skipped**, because `if: failure()` is false for a cancelled job |
| (ii) Per-test timeout | Job `failure`, step "Run Playwright tests" failed, log contains `Test timeout of 30000ms exceeded.` (or 45/60/90 s for the five tests in `checkout-loyalty-toggle.spec.ts` that call `test.setTimeout`) |
| (iii) Assertion failure | Job `failure`, same step, log contains `Error: expect(…).toBe…` / `toHaveText` with `Expected:` / `Received:`. The `playwright-report` artifact is uploaded |
| (iv) Concurrency cancel | **Not possible for this workflow:** it has no `concurrency:` / `cancel-in-progress`. Only another workflow's cancellation, or a manual cancel, would show as cancelled with a duration under 15 minutes |

Commands for whoever has access (run from the repo root):

```bash
gh run list --workflow=web-e2e.yml --limit 20 --json databaseId,headBranch,event,conclusion,createdAt,updatedAt
gh api repos/Saade09/presentail-web/actions/runs/<id>/jobs \
  --jq '.jobs[] | {conclusion, started_at, completed_at, steps: [.steps[] | {name, conclusion, started_at, completed_at}]}'
gh run view <id> --log-failed | tail -200
```

The per-step `started_at` / `completed_at` from the second command also answer
"where do the 15 minutes go" exactly.

## Local reproduction

Environment: GitHub Actions `ubuntu` runner (Linux 6.17, Azure), **4 vCPU**,
Node v24, pnpm 10.26.1, commit `799c3f24` (`main`). I timed each step from the
workflow with `date +%s` before and after.

| # | Workflow step | Local wall-clock | Notes |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | **6 s** | The pnpm store was already warm on this runner. CI restores it through `setup-node` `cache: pnpm`, so CI is probably 20–60 s (not measured) |
| 2 | `pnpm run typecheck:libs` | **7 s** | `tsc --build`, passed |
| 3 | `playwright install chromium --with-deps` | **27 s** | Downloaded Chrome Headless Shell 147 (112 MiB) + FFmpeg. The workflow does **not** cache `~/.cache/ms-playwright` |
| 4 | `PORT=5173 … run dev &` | **not run** | Blocked: the agent's permissions refused any command that sets an environment variable. `vite.config.ts:511-515` throws `PORT environment variable is required but was not provided.` without it. This is the same blocker the CI-baseline report hit. I did not try to work around a permission refusal |
| 5 | `npx wait-on http://localhost:5173` | **not run** | Depends on 4 |
| 6 | `PLAYWRIGHT_BASE_URL=… run test:e2e` | **not run** | Depends on 4, and sets an env var itself |

**Playwright summary: not available.** The suite was not executed, so there are
no passed/failed/flaky/skipped counts and no suite duration. I am not reporting
any test as failing or passing.

What *was* measured: steps 1–3 together take about **40 s** locally. Even with
generous CI allowances (checkout + setup-node + cold cache restore ≈ 1 min,
`--with-deps` apt work ≈ 1 min, dev-server start + `wait-on` ≤ 1 min), setup is
roughly **2–3 minutes**. **The test step itself is what dominates:** it gets
about 12–13 of the 15 minutes.

## Configuration facts (`artifacts/presentail-web/playwright.config.ts`)

| Setting | `playwright.config.ts` (used by `test:e2e`) | `playwright.serve.config.ts` |
|---|---|---|
| `testDir` | `./e2e` | `./e2e-serve` |
| `workers` | **not set** → Playwright default = half the logical CPUs. On this 4-vCPU runner that is **2 workers**. `checkout-loyalty-toggle.spec.ts:541` mentions "2-worker parallel runs" | not set |
| `retries` | **1** (always, not only on CI) | 1 |
| `timeout` | 30 000 ms per test. Five tests override it to 45–90 s (`checkout-loyalty-toggle.spec.ts:373,476,541,594,638`) | 30 000 ms |
| `expect.timeout` | not set → Playwright default **5 000 ms** | not set → 5 000 ms |
| `fullyParallel` | **not set (false)**: files run in parallel, tests inside a file run serially | not set |
| `projects` | **2**: `chromium` (Desktop Chrome) and `Mobile Chrome` (Pixel 5, 390×844). Every spec runs twice | 1 (`chromium`) |
| `process.env.CI` handling | **none**: CI gets the same workers/retries as local, and there is no `forbidOnly` | none |
| `webServer` | none. The workflow starts the **Vite dev server** itself | none |

Suite size, from `pnpm exec playwright test --list` (needs no server):
**`Total: 1086 tests in 44 files`**, i.e. 543 tests × 2 projects.

### Why this suite is tight against 15 minutes, by arithmetic

- 1086 tests ÷ 2 workers = **543 tests per worker**, run back to back.
- About 12.5 minutes are left for the test step (750 s). 750 s ÷ 543 means
  **every test must average under 1.4 s** for the job to finish, including its
  `page.goto`.
- These tests run against a **Vite dev server**, which transforms modules on
  demand. A first visit in each new browser context costs much more than it would
  against a production build. An average under 1.4 s is plausible for a fully
  green run, but there is very little headroom.
- **Failures are expensive.** A test that hangs until its 30 s timeout and then
  retries once (`retries: 1`) costs ≥ 60 s of one worker's time. Each such test
  takes about **30 s** of wall-clock off a 2-worker run. About 20 hanging tests
  would use up the entire margin by themselves.
- A likely source of hangs/failures (inferred from code, **not observed**): the
  workflow starts **only** the Vite dev server. `vite.config.ts` (`server:` block,
  lines 702-710) has **no `/api` proxy**, and the API server is not started.
  36 of the 44 spec files stub requests with `page.route(...)` (232 calls), so
  **8 spec files make no `page.route` calls**. Any request a spec does not stub
  falls through to Vite, which answers with no real API data.

That fits both outcomes. A run with many slow failures overruns the cap
(CANCELLED, PR #4). A run whose failures fail fast finishes inside it (FAILED,
#9–#11). The timing varies between runs.

## Recommendation

### 1. First, find out what is failing (no limit change)

Read one FAILED log (#9, #10 or #11) and download its `playwright-report`
artifact. That artifact is uploaded on failure and kept for 7 days, so it may
already have expired for older runs. If tests fail, **fix the tests or the app
(or start the API/mocks they need). Raising `timeout-minutes` would be the wrong
fix**, because the job would still be red, only later.

### 2. Recommended `timeout-minutes` (for issue #8; a human edits `.github/`)

I could not measure a p-worst end-to-end duration. The only hard data point is
the cancelled run, which was **still running at 15m16s**, so the real duration is
**> 15 min** and unknown. A value can only be derived once a run completes.

- Rule to apply once `gh api …/jobs` gives real numbers: **`timeout-minutes` =
  ceil(worst observed successful-or-failed job duration × 1.5)**, i.e. 50 %
  headroom for runner variance and cold caches.
- Provisional value until then: **25**. If a run at 25 completes in about 16–17
  min, then 17 × 1.5 ≈ 25.5 means 25 is about right. If `playwright install` is
  cached (below), take 20. **If a run at 25 also times out, the suite is hanging,
  not slow.** Do not keep raising the limit in that case. Treat it as a test
  failure (point 1).

### 3. Cheaper alternatives, ranked (all are `.github/` or config changes → recommendations only)

| Rank | Change | Rough saving | Comment |
|---|---|---|---|
| 1 | **Shard across 2–4 matrix jobs** (`--shard=${{ matrix.shard }}/N`) | Test step ÷ N (e.g. ~12 min → ~3–6 min wall-clock per job) | Biggest win. It also gives each shard its own 15-minute budget. Each shard repeats ~2 min of setup |
| 2 | **Fix failing / hanging tests**, or provide the `/api` the specs expect | Up to ~30 s wall-clock per hanging test (30 s × 2 attempts ÷ 2 workers) | Needed anyway for a green job. This is the step to do first |
| 3 | **Run against `vite preview` / `serve.mjs` on a production build** instead of the dev server | Probably large per test (no on-demand transforms), minus ~1–2 min for the build | Blocked today: the CI web build fails on unsubstituted `VITE_*` placeholders (CI-baseline note C). That would need fixing first |
| 4 | **Raise `workers`** (e.g. `workers: process.env.CI ? 4 : undefined`) | Up to ~2× on the test step if the runner has headroom | A 4-vCPU runner running 4 Chromium instances plus Vite may get flaky, and the code already allows extra time for "2-worker parallel runs". Try it after sharding, not instead of it |
| 5 | **Cache `~/.cache/ms-playwright`** keyed on the Playwright version, and run `install-deps` only | ~20–30 s (measured download ≈ 27 s including deps) | Cheap and safe, but small: it does not cover a > 15-minute overrun |
| 6 | Only on CI, drop the `Mobile Chrome` project for specs that are not layout-sensitive | Up to ~50 % of the test step | This changes coverage, and the config comment says the mobile project is deliberate for keyboard-nav. It's a product decision for QA, not my recommendation |

**What I would actually do:** (2) read and fix the failures first, then (1) shard
into 3, plus (5) cache the browsers. Keep `timeout-minutes` at **20** per shard
after that. Raise the single-job limit to 25 only as a stop-gap until sharding
lands.

Also worth changing, separate from timing: the "Upload Playwright report" step
uses `if: failure()`, so **a timed-out (cancelled) run uploads no report**. That
is exactly the case QA needs to diagnose. Use `if: always()` so timeouts also
upload the report.

## What I could NOT verify, and why

- **No job log, conclusion, duration or failing step was read for any run.** All
  Actions API/log access (`gh run …`, `gh api`, `curl api.github.com`, the Actions
  web page) was refused by this agent's permission layer. The CANCELLED/FAILED
  conclusions and the 09:36:32 → 09:51:48 timestamps are second-hand: from the
  task brief and `docs/qa/ci-baseline-main.md` on branch
  `hive/ci-baseline-main-36848282978`.
- **The suite was not run locally.** Commands that set environment variables
  (`PORT`, `PLAYWRIGHT_BASE_URL`) were refused. `vite.config.ts` requires `PORT`
  for the dev server. I did not work around the refusal. So there is no
  passed/failed count, no suite duration, and no failing assertion to report.
- The CI pnpm install time and the size of the `--with-deps` apt step on a fresh
  runner were not measured (the local store and system packages were warm).
- The per-test cost and the "8 spec files without `page.route` hit a missing API"
  hypothesis are inferred from code, not observed.

## Scope

Diagnostic report only. No workflow (`.github/`), test, Playwright/Vite config,
application code or lockfile was changed. This markdown file is the only addition.
