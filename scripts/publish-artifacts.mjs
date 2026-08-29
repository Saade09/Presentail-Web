#!/usr/bin/env node
/**
 * Publish the workspace artifacts with one shared validation pass.
 *
 * This is intentionally a build coordinator, not a replacement for the
 * artifact-specific checks. A cache hit still runs the relevant typecheck and
 * provenance/integrity verification before the output can be published.
 */

import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCacheKey,
  getArtifactSourceHash,
} from "./build-artifact-provenance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CACHE_DIR = path.join(ROOT, ".cache", "publish-artifacts");
const argv = process.argv.slice(2);

const arg = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const hasFlag = (name) => argv.includes(`--${name}`);
const truthy = (value) => ["1", "true", "yes", "on"].includes(String(value).toLowerCase());

const artifactDefinitions = {
  api: {
    label: "api",
    outputPath: "artifacts/api-server/dist",
    restorePaths: ["artifacts/api-server/dist", "artifacts/api-server/debug-source-maps"],
    typecheck: ["pnpm", "--filter", "@workspace/api-server", "run", "typecheck:artifact"],
    build: ["pnpm", "--filter", "@workspace/api-server", "run", "build"],
    verify: ["pnpm", "--filter", "@workspace/api-server", "run", "verify-build"],
    preflight: ["pnpm", "--filter", "@workspace/api-server", "run", "verify-migration-gate"],
    buildConfiguration: "api-esbuild-runtime",
  },
  web: {
    label: "web",
    outputPath: "artifacts/presentail-web/dist/public",
    restorePaths: ["artifacts/presentail-web/dist"],
    typecheck: ["pnpm", "--filter", "@workspace/presentail-web", "run", "typecheck:artifact"],
    build: ["pnpm", "--filter", "@workspace/presentail-web", "run", "build"],
    verify: ["pnpm", "--filter", "@workspace/presentail-web", "run", "verify-build"],
    buildConfiguration: "vite-production",
  },
  mobile: {
    label: "mobile",
    outputPath: "artifacts/presentail/static-build",
    restorePaths: ["artifacts/presentail/static-build"],
    typecheck: ["pnpm", "--filter", "@workspace/presentail", "run", "typecheck:artifact"],
    build: ["pnpm", "--filter", "@workspace/presentail", "run", "build"],
    verify: ["pnpm", "--filter", "@workspace/presentail", "run", "verify-build"],
    buildConfiguration: "expo-static-production",
  },
};

function elapsedMs(startedAt) {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
}

function phaseRecord(phases, phase, startedAt, details = {}) {
  const record = {
    phase,
    durationMs: elapsedMs(startedAt),
    ...details,
  };
  phases.push(record);
  console.log(JSON.stringify({ event: "publish_phase", ...record }));
  return record;
}

function commandString(command, args) {
  return [command, ...args].join(" ");
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 && !signal) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${commandString(command, args)} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }`,
        ),
      );
    });
  });
}

async function measuredCommand(phases, phase, command, args, env, details = {}) {
  const startedAt = process.hrtime.bigint();
  try {
    await run(command, args, env);
    phaseRecord(phases, phase, startedAt, { status: "passed", ...details });
  } catch (error) {
    phaseRecord(phases, phase, startedAt, { status: "failed", ...details });
    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyPath(source, target) {
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
}

async function copyPaths(relativePaths, destinationRoot) {
  for (const relativePath of relativePaths) {
    const source = path.join(ROOT, relativePath);
    if (!(await pathExists(source))) {
      throw new Error(`Cannot cache missing publish output ${relativePath}.`);
    }
    await copyPath(source, path.join(destinationRoot, relativePath));
  }
}

async function restoreCache(definition, cacheEntry) {
  for (const relativePath of definition.restorePaths) {
    const cachedPath = path.join(cacheEntry, "outputs", relativePath);
    const target = path.join(ROOT, relativePath);
    if (!(await pathExists(cachedPath))) {
      throw new Error(
        `[${definition.label}] Cache entry is incomplete: missing ${relativePath}.`,
      );
    }
    await copyPath(cachedPath, target);
  }
}

async function storeCache(definition, cacheEntry, sourceHash, buildDurationMs) {
  const temporary = `${cacheEntry}.tmp-${process.pid}`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(path.join(temporary, "outputs"), { recursive: true });
  await copyPaths(definition.restorePaths, path.join(temporary, "outputs"));
  await writeFile(
    path.join(temporary, "metadata.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        artifact: definition.label,
        sourceHash,
        buildDurationMs,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await rm(cacheEntry, { recursive: true, force: true });
  await rename(temporary, cacheEntry);
}

async function readCacheMetadata(cacheEntry) {
  try {
    return JSON.parse(await readFile(path.join(cacheEntry, "metadata.json"), "utf8"));
  } catch {
    return null;
  }
}

async function artifactSize(outputPath) {
  const output = JSON.parse(
    await readFile(path.join(outputPath, ".build-provenance.json"), "utf8"),
  );
  return {
    bytes: Number(output.output?.bytes ?? 0),
    files: Number(output.output?.files ?? 0),
    sha256: output.output?.sha256 ?? null,
  };
}

async function optionalPhase(phases, phase, environmentKey, description) {
  const command = process.env[environmentKey];
  if (!command) {
    phaseRecord(phases, phase, process.hrtime.bigint(), {
      status: "skipped",
      reason: "not_exposed",
      description,
    });
    return;
  }
  await measuredCommand(phases, phase, "sh", ["-c", command], process.env);
}

function selectedArtifacts() {
  const requested = arg("artifacts", arg("artifact", "api,web,mobile"));
  const names = requested
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const name of names) {
    if (!artifactDefinitions[name]) {
      throw new Error(`Unknown artifact "${name}". Use api,web,mobile.`);
    }
  }
  return [...new Set(names)];
}

function reportPath(cacheRoot) {
  return path.resolve(
    ROOT,
    arg("report", path.join(cacheRoot, "reports", `publish-${Date.now()}.json`)),
  );
}

async function writeReport(filePath, report) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function addComparison(report) {
  const comparisonPath = arg("compare");
  if (!comparisonPath) return;
  try {
    const before = JSON.parse(await readFile(path.resolve(ROOT, comparisonPath), "utf8"));
    report.comparison = {
      beforeReport: comparisonPath,
      beforeTotalMs: before.totalDurationMs ?? null,
      afterTotalMs: report.totalDurationMs,
      deltaMs:
        before.totalDurationMs == null
          ? null
          : report.totalDurationMs - before.totalDurationMs,
      cacheHitRate: report.cacheHitRate,
      estimatedComputeSavingsMs: report.estimatedComputeSavingsMs,
    };
  } catch {
    report.comparison = {
      beforeReport: comparisonPath,
      status: "unavailable",
      reason: "comparison report could not be read",
    };
  }
}

async function main() {
  const startedAt = process.hrtime.bigint();
  const phases = [];
  const cacheRoot = path.resolve(
    ROOT,
    arg("cache-dir", process.env.PUBLISH_CACHE_DIR || DEFAULT_CACHE_DIR),
  );
  const names = selectedArtifacts();
  const noCache =
    hasFlag("no-cache") || truthy(process.env.PUBLISH_CACHE_BYPASS);
  const clean = hasFlag("clean") || truthy(process.env.PUBLISH_CLEAN);
  const cacheReadEnabled = !noCache && !clean;
  const cacheWriteEnabled = !noCache;
  const reportFile = reportPath(cacheRoot);
  const report = {
    schemaVersion: 1,
    kind: "publish-measurement",
    status: "running",
    startedAt: new Date().toISOString(),
    artifacts: [],
    phases,
    cacheReadEnabled,
    cacheWriteEnabled,
    cleanBuild: clean,
  };

  try {
    if (hasFlag("install") || truthy(process.env.PUBLISH_RUN_INSTALL)) {
      await measuredCommand(
        phases,
        "install",
        "pnpm",
        ["install", "--frozen-lockfile"],
        process.env,
      );
    } else {
      phaseRecord(phases, "install", process.hrtime.bigint(), {
        status: "skipped",
        reason: "dependencies_are_prepared_by_the_publish_environment",
      });
    }

    await measuredCommand(
      phases,
      "shared-validation",
      "pnpm",
      ["run", "typecheck:libs"],
      process.env,
      { scope: "workspace-libraries" },
    );

    let estimatedComputeSavingsMs = 0;
    for (const name of names) {
      const definition = artifactDefinitions[name];
      const sourceHash = await getArtifactSourceHash(name);
      const cacheKey = buildCacheKey({
        name,
        sourceHash,
        buildConfiguration: definition.buildConfiguration,
      });
      const cacheEntry = path.join(cacheRoot, "entries", name, cacheKey);
      const artifactReport = {
        artifact: name,
        sourceHash,
        cacheKey,
        cacheHit: false,
      };

      if (name === "api") {
        await measuredCommand(
          phases,
          "api-migration-gate",
          definition.preflight[0],
          definition.preflight.slice(1),
          process.env,
          { artifact: name },
        );
      }

      await measuredCommand(
        phases,
        `${name}-validation`,
        definition.typecheck[0],
        definition.typecheck.slice(1),
        process.env,
        { artifact: name, scope: "artifact-specific" },
      );

      const metadata = await readCacheMetadata(cacheEntry);
      if (cacheReadEnabled && metadata?.sourceHash === sourceHash) {
        const restoreStarted = process.hrtime.bigint();
        try {
          await restoreCache(definition, cacheEntry);
          await measuredCommand(
            phases,
            `${name}-cache-verification`,
            definition.verify[0],
            definition.verify.slice(1),
            {
              ...process.env,
              BUILD_CACHE_HIT: "true",
            },
            { artifact: name, cacheKey },
          );
          phaseRecord(phases, `${name}-cache-restore`, restoreStarted, {
            status: "hit",
            artifact: name,
            cacheKey,
          });
          artifactReport.cacheHit = true;
          artifactReport.buildDurationMs = metadata.buildDurationMs;
          estimatedComputeSavingsMs += Number(metadata.buildDurationMs || 0);
        } catch (error) {
          phaseRecord(phases, `${name}-cache-restore`, restoreStarted, {
            status: "rejected",
            artifact: name,
            cacheKey,
            reason: error.message,
          });
          await rm(cacheEntry, {
            recursive: true,
            force: true,
          });
        }
      }

      if (!artifactReport.cacheHit) {
        const buildStarted = process.hrtime.bigint();
        await measuredCommand(
          phases,
          `${name}-build`,
          definition.build[0],
          definition.build.slice(1),
          {
            ...process.env,
            BUILD_CACHE_HIT: "false",
          },
          { artifact: name, cacheKey },
        );
        artifactReport.buildDurationMs = elapsedMs(buildStarted);
        await measuredCommand(
          phases,
          `${name}-bundle-post-processing`,
          definition.verify[0],
          definition.verify.slice(1),
          {
            ...process.env,
            BUILD_CACHE_HIT: "false",
          },
          { artifact: name, cacheKey },
        );
        if (cacheWriteEnabled) {
          const storeStarted = process.hrtime.bigint();
          await storeCache(
            definition,
            cacheEntry,
            sourceHash,
            artifactReport.buildDurationMs,
          );
          phaseRecord(phases, `${name}-cache-store`, storeStarted, {
            status: "stored",
            artifact: name,
            cacheKey,
          });
        } else {
          phaseRecord(phases, `${name}-cache-store`, process.hrtime.bigint(), {
            status: "skipped",
            reason: "cache disabled",
            artifact: name,
          });
        }
      }

      artifactReport.output = await artifactSize(
        path.join(ROOT, definition.outputPath),
      );
      report.artifacts.push(artifactReport);
    }

    await optionalPhase(
      phases,
      "context-packaging",
      "PUBLISH_CONTEXT_PACKAGING_COMMAND",
      "The Replit publish environment owns context packaging; no local hook was provided.",
    );
    await optionalPhase(
      phases,
      "image-push",
      "PUBLISH_IMAGE_PUSH_COMMAND",
      "The Replit publish environment owns image pushes; no local hook was provided.",
    );
    await optionalPhase(
      phases,
      "startup",
      "PUBLISH_STARTUP_COMMAND",
      "Startup is measured only when a publish environment exposes a command hook.",
    );
    if (process.env.PUBLISH_HEALTH_URL) {
      const healthStarted = process.hrtime.bigint();
      const response = await fetch(process.env.PUBLISH_HEALTH_URL, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`health check returned HTTP ${response.status}`);
      phaseRecord(phases, "health-check", healthStarted, {
        status: "passed",
        url: process.env.PUBLISH_HEALTH_URL,
      });
    } else {
      phaseRecord(phases, "health-check", process.hrtime.bigint(), {
        status: "skipped",
        reason: "health endpoint is not exposed during local publish",
      });
    }

    report.status = "passed";
    report.totalDurationMs = elapsedMs(startedAt);
    report.cacheHitRate =
      report.artifacts.length === 0
        ? 0
        : report.artifacts.filter((artifact) => artifact.cacheHit).length /
          report.artifacts.length;
    report.estimatedComputeSavingsMs = estimatedComputeSavingsMs;
    report.finishedAt = new Date().toISOString();
    await addComparison(report);
    await writeReport(reportFile, report);
    console.log(
      `PUBLISH_SUMMARY status=passed total_duration_ms=${report.totalDurationMs} cache_hit_rate=${report.cacheHitRate} estimated_compute_savings_ms=${estimatedComputeSavingsMs} report=${reportFile}`,
    );
  } catch (error) {
    report.status = "failed";
    report.totalDurationMs = elapsedMs(startedAt);
    report.cacheHitRate =
      report.artifacts.length === 0
        ? 0
        : report.artifacts.filter((artifact) => artifact.cacheHit).length /
          report.artifacts.length;
    report.estimatedComputeSavingsMs = 0;
    report.error = error instanceof Error ? error.message : String(error);
    report.finishedAt = new Date().toISOString();
    await writeReport(reportFile, report);
    console.error(`PUBLISH_SUMMARY status=failed report=${reportFile}`);
    throw error;
  }
}

main().catch(() => {
  process.exitCode = 1;
});