#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const WORKFLOW_FILE = "db-migrate-prod.yml";
const DEFAULT_REPOSITORY = "presentail/presentail";

function revision() {
  if (process.env.API_RELEASE_REVISION) return process.env.API_RELEASE_REVISION;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error(
      "Cannot determine the release commit for production migration-gate verification.",
    );
  }
}

async function verify() {
  if (process.env.API_REQUIRE_MIGRATION_GATE !== "1") {
    console.log(
      "MIGRATION_GATE status=skipped reason=API_REQUIRE_MIGRATION_GATE-not-enabled",
    );
    return;
  }

  const token =
    process.env.GITHUB_ACTIONS_TOKEN ||
    process.env.GITHUB_DISPATCH_TOKEN ||
    process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "Production migration gate cannot be verified: configure GITHUB_TOKEN (Actions read access) or GITHUB_DISPATCH_TOKEN.",
    );
  }

  const repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must use the owner/repository format.");
  }

  const sha = revision();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(`Invalid release commit SHA: ${sha}`);
  }

  const url = new URL(
    `https://api.github.com/repos/${repository}/actions/workflows/${WORKFLOW_FILE}/runs`,
  );
  url.searchParams.set("head_sha", sha);
  url.searchParams.set("status", "completed");
  url.searchParams.set("per_page", "20");

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "presentail-api-release-gate/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `Production migration gate lookup failed with GitHub HTTP ${response.status}; release is blocked.`,
    );
  }

  const payload = await response.json();
  const runs = Array.isArray(payload.workflow_runs)
    ? payload.workflow_runs
    : [];
  const passingRuns = runs.filter(
    (run) => run?.head_sha === sha && run?.conclusion === "success",
  );
  let passingRun = null;
  for (const run of passingRuns) {
    const jobsResponse = await fetch(run.jobs_url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "presentail-api-release-gate/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!jobsResponse.ok) {
      throw new Error(
        `Production migration job lookup failed with GitHub HTTP ${jobsResponse.status}; release is blocked.`,
      );
    }
    const jobsPayload = await jobsResponse.json();
    const jobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : [];
    const migrationJob = jobs.find(
      (job) =>
        job?.name === "Push schema to production database" &&
        job?.conclusion === "success",
    );
    const migrationStep = migrationJob?.steps?.find(
      (step) =>
        step?.name === "Push schema to production database" &&
        step?.conclusion === "success",
    );
    if (migrationStep) {
      passingRun = run;
      break;
    }
  }

  if (!passingRun) {
    const conclusions = [
      ...new Set(runs.map((run) => run?.conclusion).filter(Boolean)),
    ];
    throw new Error(
      `Production migration gate has no run with a successful migration job and schema-push step for ${sha}. Observed workflow conclusions: ${
        conclusions.join(", ") || "no completed run"
      }. Wait for or retry the workflow before publishing.`,
    );
  }

  console.log(
    `MIGRATION_GATE status=passed revision=${sha} workflow_run_id=${passingRun.id}`,
  );
}

verify().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
