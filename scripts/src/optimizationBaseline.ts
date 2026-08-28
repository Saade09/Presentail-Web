#!/usr/bin/env node
/**
 * Collect a reproducible, privacy-safe optimization baseline.
 *
 * The default mode builds and probes isolated local services. Supplying
 * --web-url, --api-url, or --mobile-url probes that service instead; this is
 * intentionally bounded to a fixed route list and never sends request bodies.
 *
 * Examples:
 *   pnpm baseline:optimization
 *   pnpm baseline:optimization -- --skip-build --web-url https://presentail.com
 *   pnpm baseline:optimization -- --compare docs/reports/optimization-baseline-2026-08-27.json --enforce-budgets
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUTPUT = path.join(ROOT, "docs/reports/optimization-baseline-latest.json");
const args = process.argv.slice(2);

function readArg(name: string, fallback: string | null = null): string | null {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function resolveWorkspacePath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

export function parseSafeTargetUrl(
  value: string,
  optionName: string,
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `--${optionName} must be a valid HTTP(S) origin without credentials, path, query, or fragment`,
    );
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `--${optionName} must be an HTTP(S) origin without credentials, path, query, or fragment`,
    );
  }
  return parsed.origin;
}

function readTargetUrl(name: string): string | null {
  const value = readArg(name);
  return value ? parseSafeTargetUrl(value, name) : null;
}

const outputPath = resolveWorkspacePath(readArg("output", DEFAULT_OUTPUT) as string);
const skipBuild = hasFlag("skip-build");
const noStart = hasFlag("no-start");
const enforceBudgets = hasFlag("enforce-budgets");
const allowRegressions = hasFlag("allow-regressions");
const comparePath = readArg("compare");
const observationStartedAt = new Date();

type BuildMeasurement = {
  command: string;
  durationMs: number | null;
  status: "measured" | "unavailable";
  error?: string;
};

type ServiceTarget = {
  name: "api" | "web" | "mobile";
  baseUrl: string | null;
  localPort: number;
  command: string | null;
  healthPath: string;
  process: ChildProcess | null;
  startupMs: number | null;
  startupStatus: "measured" | "unavailable" | "not_started";
};

type NetworkMeasurement = {
  service: string;
  route: string;
  method: "GET";
  status: number | null;
  durationMs: number | null;
  responseBytes: number | null;
  contentEncoding: string | null;
  cacheControl: string | null;
  age: number | null;
  vary: string | null;
  finalUrl: string | null;
  statusType: "measured" | "unavailable";
  error?: string;
};

const builds: Record<string, BuildMeasurement> = {};

const budgets = {
  startupMs: 30_000,
  requestTtfbOrTotalMs: 1_500,
  apiArtifactBytes: 25_000_000,
  webArtifactBytes: 30_000_000,
  mobileArtifactBytes: 65_000_000,
  apiRssBytes: 512_000_000,
  comparisonDurationMultiplier: 1.2,
  comparisonBytesMultiplier: 1.25,
};

async function timedBuild(name: string, command: string, commandArgs: string[]): Promise<void> {
  const started = process.hrtime.bigint();
  try {
    await execFileAsync(command, commandArgs, {
      cwd: ROOT,
      env: { ...process.env, CI: "1" },
      maxBuffer: 1_000_000,
    });
    builds[name] = {
      command: [command, ...commandArgs].join(" "),
      durationMs: elapsedMs(started),
      status: "measured",
    };
  } catch (error) {
    builds[name] = {
      command: [command, ...commandArgs].join(" "),
      durationMs: elapsedMs(started),
      status: "unavailable",
      error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    };
    throw new Error(`Build failed for ${name}: ${builds[name].error}`);
  }
}

function elapsedMs(started: bigint): number {
  return Math.round((Number(process.hrtime.bigint() - started) / 1_000_000) * 100) / 100;
}

async function fileInventory(directory: string): Promise<{
  directory: string;
  exists: boolean;
  files: number;
  bytes: number;
  byExtension: Record<string, { files: number; bytes: number }>;
  largestFiles: Array<{ path: string; bytes: number }>;
}> {
  const byExtension: Record<string, { files: number; bytes: number }> = {};
  const files: Array<{ path: string; bytes: number }> = [];

  async function visit(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      const fileStat = await stat(fullPath);
      const bytes = fileStat.size;
      const extension = path.extname(entry.name).toLowerCase() || "[none]";
      const group = byExtension[extension] ?? { files: 0, bytes: 0 };
      group.files += 1;
      group.bytes += bytes;
      byExtension[extension] = group;
      files.push({ path: path.relative(ROOT, fullPath), bytes });
    }
  }

  const exists = await stat(directory).then(() => true).catch(() => false);
  if (exists) await visit(directory);
  files.sort((a, b) => b.bytes - a.bytes);
  return {
    directory: path.relative(ROOT, directory),
    exists,
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    byExtension,
    largestFiles: files.slice(0, 10),
  };
}

function serviceTargets(): ServiceTarget[] {
  return [
    {
      name: "api",
      baseUrl: readTargetUrl("api-url"),
      localPort: Number(readArg("api-port", "19280")),
      command: "artifacts/api-server/dist/index.mjs",
      healthPath: "/api/healthz",
      process: null,
      startupMs: null,
      startupStatus: "not_started",
    },
    {
      name: "web",
      baseUrl: readTargetUrl("web-url"),
      localPort: Number(readArg("web-port", "19281")),
      command: "artifacts/presentail-web/serve.mjs",
      healthPath: "/",
      process: null,
      startupMs: null,
      startupStatus: "not_started",
    },
    {
      name: "mobile",
      baseUrl: readTargetUrl("mobile-url"),
      localPort: Number(readArg("mobile-port", "19282")),
      command: "artifacts/presentail/server/serve.js",
      healthPath: "/app/",
      process: null,
      startupMs: null,
      startupStatus: "not_started",
    },
  ];
}

function localBaseUrl(target: ServiceTarget): string {
  return `http://127.0.0.1:${target.localPort}`;
}

function joinUrl(baseUrl: string, route: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${route.replace(/^\/+/, "")}`;
}

async function waitForService(target: ServiceTarget): Promise<void> {
  const started = process.hrtime.bigint();
  const url = joinUrl(target.baseUrl as string, target.healthPath);
  let lastError = "not reachable";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status < 500) {
        target.startupMs = elapsedMs(started);
        target.startupStatus = "measured";
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  target.startupMs = elapsedMs(started);
  target.startupStatus = "unavailable";
  throw new Error(`${target.name} did not become ready: ${lastError}`);
}

function startLocalService(target: ServiceTarget): void {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(target.localPort),
    ...(target.name === "api" ? { BASELINE_DISABLE_WORKERS: "1" } : {}),
    ...(target.name === "web"
      ? { BASE_PATH: "/", INTERNAL_API_BASE_URL: `http://127.0.0.1:${serviceTargets()[0].localPort}` }
      : {}),
    ...(target.name === "mobile"
      ? { BASE_PATH: "/app/", STATIC_LANDING: "true" }
      : {}),
  };
  const commandArgs =
    target.name === "api"
      ? ["--enable-source-maps", target.command as string]
      : [target.command as string];
  target.baseUrl = localBaseUrl(target);
  target.process = spawn("node", commandArgs, {
    cwd: ROOT,
    env,
    stdio: "ignore",
  });
}

async function stopLocalServices(targets: ServiceTarget[]): Promise<void> {
  const hasExited = (child: ChildProcess): boolean =>
    child.exitCode !== null || child.signalCode !== null;
  const waitForExit = (child: ChildProcess, timeoutMs: number): Promise<boolean> =>
    new Promise((resolve) => {
      if (hasExited(child)) {
        resolve(true);
        return;
      }
      const timeout = setTimeout(() => {
        child.off("exit", onExit);
        resolve(hasExited(child));
      }, timeoutMs);
      const onExit = () => {
        clearTimeout(timeout);
        resolve(true);
      };
      child.once("exit", onExit);
    });

  for (const target of targets) {
    if (!target.process || hasExited(target.process)) continue;
    target.process.kill("SIGTERM");
  }
  await Promise.all(
    targets
      .map((target) => target.process)
      .filter((child): child is ChildProcess => child !== null)
      .map((child) => waitForExit(child, 2_000)),
  );
  for (const target of targets) {
    if (target.process && !hasExited(target.process)) target.process.kill("SIGKILL");
  }
  await Promise.all(
    targets
      .map((target) => target.process)
      .filter((child): child is ChildProcess => child !== null && !hasExited(child))
      .map((child) => waitForExit(child, 2_000)),
  );
}

async function measureNetwork(
  target: ServiceTarget,
  route: string,
  headers: Record<string, string> = {},
): Promise<NetworkMeasurement> {
  if (!target.baseUrl) {
    return {
      service: target.name,
      route,
      method: "GET",
      status: null,
      durationMs: null,
      responseBytes: null,
      contentEncoding: null,
      cacheControl: null,
      age: null,
      vary: null,
      finalUrl: null,
      statusType: "unavailable",
      error: "No URL supplied and service was not started",
    };
  }
  const url = joinUrl(target.baseUrl, route);
  const started = process.hrtime.bigint();
  try {
    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.arrayBuffer();
    const header = (name: string): string | null => response.headers.get(name);
    const ageValue = Number(header("age"));
    return {
      service: target.name,
      route,
      method: "GET",
      status: response.status,
      durationMs: elapsedMs(started),
      responseBytes: body.byteLength,
      contentEncoding: header("content-encoding"),
      cacheControl: header("cache-control"),
      age: Number.isFinite(ageValue) ? ageValue : null,
      vary: header("vary"),
      finalUrl:
        new URL(response.url).origin === new URL(url).origin &&
        new URL(response.url).pathname === new URL(url).pathname
          ? new URL(url).pathname
          : ":redirected",
      statusType: "measured",
    };
  } catch (error) {
    return {
      service: target.name,
      route,
      method: "GET",
      status: null,
      durationMs: elapsedMs(started),
      responseBytes: null,
      contentEncoding: null,
      cacheControl: null,
      age: null,
      vary: null,
      finalUrl: null,
      statusType: "unavailable",
      error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    };
  }
}

async function processSnapshot(): Promise<{
  host: { platform: string; arch: string; node: string; cpus: number; totalMemoryBytes: number };
  activeProcesses: Record<string, number>;
}> {
  const processCounts: Record<string, number> = {};
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "comm="], { maxBuffer: 100_000 });
    for (const command of stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
      const name = path.basename(command).slice(0, 40);
      processCounts[name] = (processCounts[name] ?? 0) + 1;
    }
  } catch {
    processCounts.unavailable = 1;
  }
  return {
    host: {
      platform: os.platform(),
      arch: os.arch(),
      node: process.version,
      cpus: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    activeProcesses: processCounts,
  };
}

async function readMetrics(target: ServiceTarget): Promise<Record<string, unknown> | null> {
  if (target.name !== "api" || !target.baseUrl) return null;
  try {
    const response = await fetch(joinUrl(target.baseUrl, "/api/healthz/metrics"), {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const json: unknown = await response.json();
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function checkBudgets(
  report: Record<string, unknown>,
  comparison: Record<string, unknown> | null,
): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  const network = (report.network as NetworkMeasurement[]) ?? [];
  const observationMode = (
    report.observationWindow as { mode?: string } | undefined
  )?.mode;
  for (const measurement of network) {
    const value = measurement.durationMs;
    const expectedIsolationUnavailable =
      observationMode === "isolated-local-services" &&
      measurement.service === "api" &&
      measurement.route.startsWith("/api/woo/products") &&
      measurement.status === 503;
    const status =
      measurement.statusType === "unavailable" || expectedIsolationUnavailable
        ? "unavailable"
        : measurement.status !== 200
          ? "fail"
          : value !== null && value <= budgets.requestTtfbOrTotalMs
            ? "pass"
            : "fail";
    results.push({
      metric: `${measurement.service}.${measurement.route}.durationMs`,
      value,
      budget: budgets.requestTtfbOrTotalMs,
      expectedStatus: expectedIsolationUnavailable ? "unavailable-in-isolation" : 200,
      observedStatus: measurement.status,
      status,
    });
  }
  const artifacts = (report.artifacts as Record<string, Awaited<ReturnType<typeof fileInventory>>>) ?? {};
  for (const [name, budget] of [
    ["api", budgets.apiArtifactBytes],
    ["web", budgets.webArtifactBytes],
    ["mobile", budgets.mobileArtifactBytes],
  ] as const) {
    const value = artifacts[name]?.bytes ?? null;
    results.push({
      metric: `${name}.artifactBytes`,
      value,
      budget,
      status: value === null ? "unavailable" : value <= budget ? "pass" : "fail",
    });
  }
  const targets = (report.services as ServiceTarget[]) ?? [];
  for (const target of targets) {
    results.push({
      metric: `${target.name}.startupMs`,
      value: target.startupMs,
      budget: budgets.startupMs,
      status:
        target.startupMs === null || target.startupStatus === "not_started"
          ? "unavailable"
          : target.startupMs <= budgets.startupMs
            ? "pass"
            : "fail",
    });
  }
  const apiMetrics = report.apiMetrics as
    | { process?: { memoryBytes?: { rss?: number } } }
    | null;
  const rssBytes = apiMetrics?.process?.memoryBytes?.rss ?? null;
  results.push({
    metric: "api.process.rssBytes",
    value: rssBytes,
    budget: budgets.apiRssBytes,
    status: rssBytes === null ? "unavailable" : rssBytes <= budgets.apiRssBytes ? "pass" : "fail",
  });
  if (comparison) {
    const currentBuilds = report.builds as Record<string, BuildMeasurement>;
    const previousBuilds = comparison.builds as Record<string, BuildMeasurement>;
    for (const name of Object.keys(currentBuilds)) {
      const current = currentBuilds[name]?.durationMs;
      const previous = previousBuilds?.[name]?.durationMs;
      const ratio = current !== null && previous ? current / previous : null;
      results.push({
        metric: `comparison.build.${name}.durationMs`,
        value: ratio,
        budget: budgets.comparisonDurationMultiplier,
        status: ratio === null ? "unavailable" : ratio <= budgets.comparisonDurationMultiplier ? "pass" : "fail",
      });
    }
    const previousArtifacts = comparison.artifacts as
      | Record<string, Awaited<ReturnType<typeof fileInventory>>>
      | undefined;
    for (const name of Object.keys(artifacts)) {
      const current = artifacts[name]?.bytes;
      const previous = previousArtifacts?.[name]?.bytes;
      const ratio = current !== undefined && previous ? current / previous : null;
      results.push({
        metric: `comparison.artifact.${name}.bytes`,
        value: ratio,
        budget: budgets.comparisonBytesMultiplier,
        status: ratio === null ? "unavailable" : ratio <= budgets.comparisonBytesMultiplier ? "pass" : "fail",
      });
    }
  }
  return results;
}

async function main(): Promise<void> {
  if (enforceBudgets && allowRegressions) {
    throw new Error("--enforce-budgets and --allow-regressions cannot be used together");
  }
  if (!skipBuild) {
    await timedBuild("api", "pnpm", ["--filter", "@workspace/api-server", "run", "build"]);
    await timedBuild("web", "pnpm", ["--filter", "@workspace/presentail-web", "run", "build"]);
    await timedBuild("mobile", "pnpm", ["--filter", "@workspace/presentail", "run", "build"]);
  }

  const targets = serviceTargets();
  const suppliedTargets = targets.filter((target) => target.baseUrl !== null);
  const productionTrafficGenerated = suppliedTargets.some((target) => {
    try {
      return new URL(target.baseUrl as string).hostname === "presentail.com";
    } catch {
      return false;
    }
  });
  const startedLocally: ServiceTarget[] = [];
  if (!noStart) {
    for (const target of targets) {
      if (!target.baseUrl) {
        startLocalService(target);
        startedLocally.push(target);
      } else {
        target.startupStatus = "not_started";
      }
    }
    try {
      for (const target of targets) {
        if (target.process) await waitForService(target);
      }
    } catch (error) {
      await stopLocalServices(startedLocally);
      throw error;
    }
  }

  try {
    const network: NetworkMeasurement[] = [];
    const api = targets.find((target) => target.name === "api") as ServiceTarget;
    const web = targets.find((target) => target.name === "web") as ServiceTarget;
    const mobile = targets.find((target) => target.name === "mobile") as ServiceTarget;
    network.push(await measureNetwork(api, "/api/healthz", { "accept-encoding": "br, gzip" }));
    network.push(await measureNetwork(api, "/api/woo/products?countryCode=LB", { "accept-encoding": "br, gzip" }));
    network.push(await measureNetwork(web, "/", { "accept-encoding": "br, gzip" }));
    network.push(await measureNetwork(web, "/en-lb/beirut", { "accept-encoding": "br, gzip" }));
    network.push(await measureNetwork(mobile, "/app/", { "accept-encoding": "br, gzip" }));
    network.push(await measureNetwork(mobile, "/app/manifest", { "expo-platform": "ios" }));

    const apiMetrics = await readMetrics(api);
    const processInfo = await processSnapshot();
    const artifacts = {
      api: await fileInventory(path.join(ROOT, "artifacts/api-server/dist")),
      web: await fileInventory(path.join(ROOT, "artifacts/presentail-web/dist")),
      mobile: await fileInventory(path.join(ROOT, "artifacts/presentail/static-build")),
    };
    const report: Record<string, unknown> = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    observationWindow: {
      startedAt: observationStartedAt.toISOString(),
      endedAt: new Date().toISOString(),
      mode: noStart ? "existing-services" : "isolated-local-services",
      lowVolume: true,
      productionTrafficGenerated,
      suppliedTargets: suppliedTargets.map((target) => target.name),
    },
    classification: {
      measured: [
        "serial local build durations",
        "artifact and bundle file sizes",
        "bounded fixed-route response timing, bytes, compression, and cache headers",
        "isolated service readiness time and process snapshot",
        "API aggregate request, worker, outbound, database-pool, and image-proxy counters when reachable",
      ],
      estimated: [
        "future cost or savings are not calculated by this report",
        "a comparison failure threshold is a regression heuristic, not provider billing",
      ],
      unavailable: [
        "Replit compute units, instance-hours, autoscale events, requests, egress, and charges",
        "provider invoices and external-service usage",
        "real-user browser vitals unless separately collected by the storefront benchmark",
      ],
    },
    environment: {
      node: process.version,
      pnpm: await execFileAsync("pnpm", ["--version"]).then((result) => result.stdout.trim()).catch(() => null),
      cwd: ROOT,
      ci: process.env.CI === "1" || process.env.CI === "true",
    },
    builds,
    artifacts,
    services: targets.map(({ process: _process, command, ...target }) => ({
      ...target,
      command: command ? `node ${command}` : null,
    })),
    network,
    apiMetrics,
    process: processInfo,
    budgets,
    source: {
      command: "pnpm baseline:optimization",
      script: "scripts/src/optimizationBaseline.ts",
      routesAreFixed: true,
      requestBodiesSent: false,
      responseBytesSource: "decoded response body observed by Node fetch",
      queryStrings: ["countryCode=LB"],
      credentialsCaptured: false,
      customerIdentifiersCaptured: false,
    },
    };

    let comparison: Record<string, unknown> | null = null;
    if (comparePath) {
      const { readFile } = await import("node:fs/promises");
      const resolvedComparePath = resolveWorkspacePath(comparePath);
      comparison = JSON.parse(await readFile(resolvedComparePath, "utf8")) as Record<string, unknown>;
      report.comparison = {
        baselineFile: path.relative(ROOT, resolvedComparePath),
        policy: "durations fail above 120%; artifact bytes fail above 125%; use --allow-regressions for intentional changes",
      };
    }
    const budgetResults = checkBudgets(report, comparison);
    report.budgetResults = budgetResults;
    report.budgetSummary = {
      pass: budgetResults.filter((item) => item.status === "pass").length,
      fail: budgetResults.filter((item) => item.status === "fail").length,
      unavailable: budgetResults.filter((item) => item.status === "unavailable").length,
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Wrote optimization baseline to ${path.relative(ROOT, outputPath)}`);
    console.log(`Budget summary: ${JSON.stringify(report.budgetSummary)}`);
    if (enforceBudgets && (report.budgetSummary as { fail: number }).fail > 0) {
      throw new Error("Optimization baseline budgets failed; inspect budgetResults or pass --allow-regressions for an intentional change.");
    }
  } finally {
    await stopLocalServices(startedLocally);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}