#!/usr/bin/env sh
# Fires a GitHub repository_dispatch event so the SEO audit workflow runs
# automatically after every Replit production deploy.
#
# Called at the end of the API server's artifact.toml production build step.
# The build step runs on every Replit publish, so this script executes on
# every deploy — not just on git pushes that touch specific paths.
#
# Required Replit secrets (set once in Replit → Secrets):
#   GITHUB_DISPATCH_TOKEN  — a GitHub fine-grained PAT or classic PAT with the
#                            "actions:write" (fine-grained) or "repo" (classic)
#                            scope on this repository.
#   GITHUB_REPOSITORY      — owner/repo slug, e.g. presentail/presentail
#
# The script is intentionally non-fatal: if either secret is missing, or if the
# curl call fails, it prints a warning and exits 0 so the deploy is never
# blocked by a monitoring concern.
#
# The dispatched event type is "production-deployed" with a client_payload of
#   { "settle_seconds": 90 }
# which the receiving workflow uses as the settle time before probing live pages.
# 90 s is enough for Replit to start the new server process and pass its health
# check after the build step has finished — notably shorter than the 180 s the
# workflow uses for push events (where the deploy itself hasn't started yet).

set -e

if [ -z "$GITHUB_DISPATCH_TOKEN" ] || [ -z "$GITHUB_REPOSITORY" ]; then
  echo "INFO: GITHUB_DISPATCH_TOKEN or GITHUB_REPOSITORY not set -- skipping post-deploy SEO audit trigger"
  exit 0
fi

echo "Triggering SEO audit workflow via repository_dispatch (production-deployed)..."

STATUS=$(curl -s -o /tmp/ghdispatch_out -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $GITHUB_DISPATCH_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  -H "User-Agent: presentail-deploy-hook/1.0" \
  "https://api.github.com/repos/$GITHUB_REPOSITORY/dispatches" \
  -d '{"event_type":"production-deployed","client_payload":{"settle_seconds":90}}')

if [ "$STATUS" = "204" ]; then
  echo "SEO audit workflow triggered (HTTP 204)"
else
  echo "WARNING: GitHub dispatch returned HTTP $STATUS -- check GITHUB_DISPATCH_TOKEN has actions:write scope"
  cat /tmp/ghdispatch_out 2>/dev/null || true
fi
