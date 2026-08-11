#!/usr/bin/env bash
# run-serve-e2e.sh — local serve-spec e2e runner
#
# Builds the web app (serialized via a process lock so parallel validation runs
# do not corrupt each other's dist), starts the SEO entity fixture server and
# serve.mjs on dynamically allocated ports, waits for both to be ready, runs
# all tests in playwright.serve.config.ts (the e2e-serve suite), and cleans up.
#
# Prerequisite: pnpm dependencies must be installed
#   pnpm install --frozen-lockfile
#
# Usage (from repo root):
#   bash artifacts/presentail-web/scripts/run-serve-e2e.sh
#
# Run only a specific spec file (path relative to e2e-serve/):
#   SERVE_E2E_SPEC=blog-image-perf.spec.ts \
#     bash artifacts/presentail-web/scripts/run-serve-e2e.sh
#
# Skip the build step when you already have a fresh dist and no parallel build
# is running (saves ~3 minutes):
#   SKIP_BUILD=1 bash artifacts/presentail-web/scripts/run-serve-e2e.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ARTIFACT_DIR="$REPO_ROOT/artifacts/presentail-web"
DIST_DIR="$ARTIFACT_DIR/dist/public"

# ---------------------------------------------------------------------------
# Build step — serialized via an exclusive lock file so parallel validation
# runs (e.g. the compression-check validation) cannot corrupt the dist by
# writing simultaneously.  The lock is released as soon as our build exits.
# ---------------------------------------------------------------------------

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  echo "==> Skipping build (SKIP_BUILD=1)"
  if [[ ! -d "$DIST_DIR" ]]; then
    echo "ERROR: dist not found at $DIST_DIR — cannot skip build without a pre-built dist" >&2
    exit 1
  fi
else
  echo "==> Building web app (serialized via /tmp/presentail-web-build.lock)..."
  (
    # Open the lock fd and hold it for the duration of the subshell.
    exec 200>/tmp/presentail-web-build.lock
    flock -w 600 200
    pnpm --filter @workspace/presentail-web run build
  )
fi

# ---------------------------------------------------------------------------
# Dynamic port allocation — avoids conflicts when other validations are running
# ---------------------------------------------------------------------------

find_free_port() {
  python3 -c \
    "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()"
}

SERVE_PORT="${SERVE_PORT:-$(find_free_port)}"
FIXTURE_PORT="${FIXTURE_PORT:-$(find_free_port)}"

# ---------------------------------------------------------------------------
# Cleanup: kill all child processes on exit
# ---------------------------------------------------------------------------

cleanup() {
  local pids
  pids=$(jobs -p 2>/dev/null) || true
  if [[ -n "$pids" ]]; then
    echo "==> Stopping background servers..."
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Start the SEO entity fixture server
# ---------------------------------------------------------------------------

echo "==> Starting SEO entity fixture server on port $FIXTURE_PORT..."
SEO_FIXTURE_PORT="$FIXTURE_PORT" \
  WISHLIST_SHARE_TOKEN="local-e2e-serve-token" \
  node "$ARTIFACT_DIR/e2e-serve/seo-entity-fixture-server.mjs" &

# ---------------------------------------------------------------------------
# Start serve.mjs
# ---------------------------------------------------------------------------

echo "==> Starting serve.mjs on port $SERVE_PORT..."
PORT="$SERVE_PORT" \
  BASE_PATH=/ \
  NODE_ENV=production \
  SERVE_TEST_HOOKS=1 \
  INTERNAL_API_BASE_URL="http://127.0.0.1:$FIXTURE_PORT" \
  STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION="000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" \
  node "$ARTIFACT_DIR/serve.mjs" &

# ---------------------------------------------------------------------------
# Wait for both servers
# ---------------------------------------------------------------------------

echo "==> Waiting for fixture server (http://127.0.0.1:$FIXTURE_PORT/healthz)..."
npx --yes wait-on "http://127.0.0.1:$FIXTURE_PORT/healthz" --timeout 30000

echo "==> Waiting for serve.mjs (http://127.0.0.1:$SERVE_PORT/)..."
npx --yes wait-on "http://127.0.0.1:$SERVE_PORT/" --timeout 30000

# ---------------------------------------------------------------------------
# Run the serve-backed e2e tests
#
# Replicates the PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH logic from the
# test:e2e:serve npm script (NixOS system chromium → override path; falls back
# to Playwright's own downloaded browser on non-NixOS/CI environments).
# ---------------------------------------------------------------------------

echo "==> Running serve e2e tests..."

CHROMIUM_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium 2>/dev/null || true)}"

SPEC_ARG=""
if [[ -n "${SERVE_E2E_SPEC:-}" ]]; then
  SPEC_ARG="$ARTIFACT_DIR/e2e-serve/$SERVE_E2E_SPEC"
  echo "    (scoped to: $SERVE_E2E_SPEC)"
fi

PLAYWRIGHT_BASE_URL="http://127.0.0.1:$SERVE_PORT" \
  WISHLIST_SHARE_TOKEN="local-e2e-serve-token" \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$CHROMIUM_PATH" \
  SERVE_TEST_HOOKS=1 \
  pnpm --filter @workspace/presentail-web exec \
    playwright test \
    --config "$ARTIFACT_DIR/playwright.serve.config.ts" \
    $SPEC_ARG

echo "==> Done."
