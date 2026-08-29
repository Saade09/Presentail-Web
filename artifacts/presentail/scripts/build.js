const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const zlib = require("zlib");

let metroProcess = null;

const projectRoot = path.resolve(__dirname, "..");

function findWorkspaceRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("Could not find workspace root (no pnpm-workspace.yaml found)");
}

const workspaceRoot = findWorkspaceRoot(projectRoot);
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");
const staticAssetBasePath = (
  process.env.STATIC_ASSET_BASE_PATH || basePath || "/"
).replace(/\/+$/, "");
const staticAssetBaseUrl = (
  process.env.STATIC_ASSET_BASE_URL || ""
).replace(/\/+$/, "");
const configuredMetroPort = Number(process.env.MOBILE_BUILD_METRO_PORT);
const metroPort =
  Number.isInteger(configuredMetroPort) && configuredMetroPort > 0
    ? configuredMetroPort
    : 18000 + (process.pid % 1000);
const metroBaseUrl = `http://localhost:${metroPort}`;
const METRO_CACHE_VERSION = 1;
const metroCacheMetadataPath = path.join(
  projectRoot,
  "node_modules",
  ".cache",
  "presentail-mobile-metro.json",
);
const metroCacheDirectories = [
  path.join(os.tmpdir(), "metro-cache"),
  path.join(projectRoot, ".metro-cache"),
  path.join(projectRoot, "node_modules/.cache/metro"),
];
const metroCacheInputFiles = [
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "artifacts/presentail/package.json",
  "artifacts/presentail/app.json",
  "artifacts/presentail/app.config.js",
  "artifacts/presentail/babel.config.js",
  "artifacts/presentail/metro.config.js",
  "artifacts/presentail/tsconfig.json",
];

function exitWithError(message) {
  console.error(message);
  if (metroProcess) {
    metroProcess.kill();
  }
  process.exit(1);
}

function setupSignalHandlers() {
  const cleanup = () => {
    if (metroProcess) {
      console.log("Cleaning up Metro process...");
      metroProcess.kill();
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
}

function phaseTimer() {
  return process.hrtime.bigint();
}

function phaseDurationMs(startedAt) {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
}

function reportPhase(phase, startedAt, details = {}) {
  console.log(
    JSON.stringify({
      event: "mobile_build_phase",
      phase,
      durationMs: phaseDurationMs(startedAt),
      ...details,
    }),
  );
}

function stripProtocol(domain) {
  let urlString = domain.trim();

  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  return new URL(urlString).host;
}

function getDeploymentDomain() {
  if (process.env.REPLIT_INTERNAL_APP_DOMAIN) {
    return stripProtocol(process.env.REPLIT_INTERNAL_APP_DOMAIN);
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    return stripProtocol(process.env.REPLIT_DEV_DOMAIN);
  }

  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return stripProtocol(process.env.EXPO_PUBLIC_DOMAIN);
  }

  console.error(
    "ERROR: No deployment domain found. Set REPLIT_INTERNAL_APP_DOMAIN, REPLIT_DEV_DOMAIN, or EXPO_PUBLIC_DOMAIN",
  );
  process.exit(1);
}

function prepareDirectories(timestamp) {
  console.log("Preparing build directories...");

  const staticBuild = path.join(projectRoot, "static-build");
  if (fs.existsSync(staticBuild)) {
    fs.rmSync(staticBuild, { recursive: true });
  }

  const dirs = [
    path.join(staticBuild, timestamp, "_expo", "static", "js", "ios"),
    path.join(staticBuild, timestamp, "_expo", "static", "js", "android"),
    path.join(staticBuild, "ios"),
    path.join(staticBuild, "android"),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log("Build:", timestamp);
}

function clearMetroCache(reason) {
  console.log(`Clearing Metro cache (${reason})...`);

  for (const dir of metroCacheDirectories) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log("Cache cleared");
}

function isTruthy(value) {
  return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

function metroCacheFingerprint(expoPublicDomain, expoPublicReplId) {
  const hash = require("crypto").createHash("sha256");

  for (const relativePath of metroCacheInputFiles) {
    const inputPath = path.join(workspaceRoot, relativePath);
    hash.update(relativePath);
    hash.update("\0");
    if (fs.existsSync(inputPath)) {
      hash.update(fs.readFileSync(inputPath));
    } else {
      hash.update("<missing>");
    }
    hash.update("\0");
  }

  const relevantEnvironment = Object.keys(process.env)
    .filter(
      (key) =>
        key.startsWith("EXPO_PUBLIC_") ||
        ["BASE_PATH", "NODE_ENV", "STATIC_ASSET_BASE_PATH"].includes(key),
    )
    .sort();
  for (const key of relevantEnvironment) {
    hash.update(key);
    hash.update("\0");
    hash.update(process.env[key] || "");
    hash.update("\0");
  }
  hash.update(`EXPO_PUBLIC_DOMAIN\0${expoPublicDomain || ""}\0`);
  hash.update(`EXPO_PUBLIC_REPL_ID\0${expoPublicReplId || ""}\0`);

  return hash.digest("hex");
}

function prepareMetroCache(fingerprint) {
  const startedAt = phaseTimer();
  const forceClean = isTruthy(
    process.env.MOBILE_BUILD_CLEAN || process.env.EXPO_BUILD_CLEAN,
  );
  const hasCache = metroCacheDirectories.some((dir) => fs.existsSync(dir));
  let previous = null;

  if (fs.existsSync(metroCacheMetadataPath)) {
    try {
      previous = JSON.parse(
        fs.readFileSync(metroCacheMetadataPath, "utf-8"),
      );
    } catch {
      previous = null;
    }
  }

  const cacheReuse =
    !forceClean &&
    hasCache &&
    previous?.version === METRO_CACHE_VERSION &&
    previous?.fingerprint === fingerprint;

  if (forceClean) {
    clearMetroCache("MOBILE_BUILD_CLEAN requested");
  } else if (cacheReuse) {
    console.log("Reusing Metro cache (inputs unchanged)");
  } else if (hasCache) {
    clearMetroCache(
      previous ? "build inputs changed" : "cache has no successful build marker",
    );
  } else {
    console.log("Metro cache not found; starting a cold build");
  }

  // A marker is written only after every build stage succeeds. A failed or
  // interrupted build therefore cannot make a partial cache look reusable.
  if (fs.existsSync(metroCacheMetadataPath)) {
    fs.rmSync(metroCacheMetadataPath, { force: true });
  }

  reportPhase("metro-cache", startedAt, {
    cacheReuse,
    cleanRequested: forceClean,
    cachePresent: hasCache,
  });
  return cacheReuse;
}

function recordSuccessfulMetroCache(fingerprint) {
  fs.mkdirSync(path.dirname(metroCacheMetadataPath), { recursive: true });
  const tempPath = `${metroCacheMetadataPath}.tmp-${process.pid}`;
  fs.writeFileSync(
    tempPath,
    JSON.stringify(
      { version: METRO_CACHE_VERSION, fingerprint },
      null,
      2,
    ),
  );
  fs.renameSync(tempPath, metroCacheMetadataPath);
}

async function checkMetroHealth() {
  try {
    const response = await fetch(`${metroBaseUrl}/status`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function getExpoPublicReplId() {
  return process.env.REPL_ID || process.env.EXPO_PUBLIC_REPL_ID;
}

async function startMetro(expoPublicDomain, expoPublicReplId) {
  const startedAt = phaseTimer();
  const isRunning = await checkMetroHealth();
  if (isRunning) {
    throw new Error(
      `Dedicated mobile build port ${metroPort} is already in use; set MOBILE_BUILD_METRO_PORT to another free port`,
    );
  }

  console.log(`Starting Metro on dedicated build port ${metroPort}...`);
  console.log(`Setting EXPO_PUBLIC_DOMAIN=${expoPublicDomain}`);
  const env = {
    ...process.env,
    EXPO_PUBLIC_DOMAIN: expoPublicDomain,
    EXPO_PUBLIC_REPL_ID: expoPublicReplId,
  };

  if (expoPublicReplId) {
    console.log(`Setting EXPO_PUBLIC_REPL_ID=${expoPublicReplId}`);
  }

  metroProcess = spawn(
    "pnpm",
    [
      "exec",
      "expo",
      "start",
      "--no-dev",
      "--minify",
      "--localhost",
      "--port",
      String(metroPort),
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      cwd: projectRoot,
      // Give Metro (and its worker threads) 4 GB of heap so the minified
      // production bundle compile doesn't hit the default ~1.5 GB limit and
      // get OOM-killed silently. The previous failed build showed Metro ready
      // but zero bundling progress — the signature of an OOM kill.
      env: {
        ...env,
        NODE_OPTIONS: [
          env.NODE_OPTIONS,
          "--max-old-space-size=4096",
        ]
          .filter(Boolean)
          .join(" "),
      },
    },
  );

  if (metroProcess.stdout) {
    metroProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      if (output) console.log(`[Metro] ${output}`);
    });
  }
  if (metroProcess.stderr) {
    metroProcess.stderr.on("data", (data) => {
      const output = data.toString().trim();
      if (output) console.error(`[Metro Error] ${output}`);
    });
  }

  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const healthy = await checkMetroHealth();
    if (healthy) {
      console.log("Metro ready");
      reportPhase("metro-startup", startedAt, {
        reusedProcess: false,
        port: metroPort,
      });
      return;
    }
  }

  console.error("Metro timeout");
  process.exit(1);
}

async function downloadFile(url, outputPath) {
  const controller = new AbortController();
  const fiveMinMS = 5 * 60 * 1_000;
  const timeoutId = setTimeout(() => controller.abort(), fiveMinMS);

  try {
    console.log(`Downloading: ${url}`);
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const file = fs.createWriteStream(outputPath);
    await pipeline(Readable.fromWeb(response.body), file);

    const fileSize = fs.statSync(outputPath).size;

    if (fileSize === 0) {
      fs.unlinkSync(outputPath);
      throw new Error("Downloaded file is empty");
    }
  } catch (error) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    if (error.name === "AbortError") {
      throw new Error(`Download timeout after 5m: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadBundle(platform, timestamp) {
  const startedAt = phaseTimer();
  const entryPath = path.resolve(projectRoot, "node_modules", "expo-router", "entry");
  const bundlePath = path.relative(workspaceRoot, entryPath);
  const url = new URL(`${metroBaseUrl}/${bundlePath}.bundle`);
  url.searchParams.set("platform", platform);
  url.searchParams.set("dev", "false");
  url.searchParams.set("hot", "false");
  url.searchParams.set("lazy", "false");
  url.searchParams.set("minify", "true");

  const output = path.join(
    "static-build",
    timestamp,
    "_expo",
    "static",
    "js",
    platform,
    "bundle.js",
  );

  console.log(`Fetching ${platform} bundle...`);
  await downloadFile(url.toString(), output);
  console.log(`${platform} bundle ready`);
  reportPhase(`bundle-${platform}`, startedAt);
}

async function downloadManifest(platform) {
  const startedAt = phaseTimer();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000);

  try {
    console.log(`Fetching ${platform} manifest...`);
    const response = await fetch(`${metroBaseUrl}/manifest`, {
      headers: { "expo-platform": platform },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = await response.json();
    console.log(`${platform} manifest ready`);
    reportPhase(`manifest-${platform}`, startedAt);
    return manifest;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `Manifest download timeout after 5m for platform: ${platform}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadBundlesAndManifests(timestamp) {
  console.log("Downloading bundles and manifests...");
  console.log("This may take several minutes for production builds...");

  try {
    // Bundles are sequential — Metro can't handle both platforms simultaneously
    // without stalling. Manifests are cheap and run in parallel after.
    await downloadBundle("ios", timestamp);
    await downloadBundle("android", timestamp);

    const [iosManifest, androidManifest] = await Promise.all([
      downloadManifest("ios"),
      downloadManifest("android"),
    ]);

    console.log("All downloads completed successfully");
    return { ios: iosManifest, android: androidManifest };
  } catch (error) {
    exitWithError(`Download failed: ${error.message}`);
  }
}

function extractAssets(timestamp) {
  const staticBuild = path.join(projectRoot, "static-build");
  const bundles = {
    ios: fs.readFileSync(
      path.join(staticBuild, timestamp, "_expo", "static", "js", "ios", "bundle.js"),
      "utf-8",
    ),
    android: fs.readFileSync(
      path.join(staticBuild, timestamp, "_expo", "static", "js", "android", "bundle.js"),
      "utf-8",
    ),
  };

  const assetsMap = new Map();
  const assetPattern =
    /httpServerLocation:"([^"]+)"[^}]*hash:"([^"]+)"[^}]*name:"([^"]+)"[^}]*type:"([^"]+)"/g;

  const extractFromBundle = (bundle, platform) => {
    for (const match of bundle.matchAll(assetPattern)) {
      const originalPath = match[1];
      const filename = match[3] + "." + match[4];

      const tempUrl = new URL(`${metroBaseUrl}${originalPath}`);
      const unstablePath = tempUrl.searchParams.get("unstable_path");

      if (!unstablePath) {
        throw new Error(`Asset missing unstable_path: ${originalPath}`);
      }

      const decodedPath = decodeURIComponent(unstablePath);
      const key = path.posix.join(decodedPath, filename);

      if (!assetsMap.has(key)) {
        const asset = {
          url: path.posix.join("/", decodedPath, filename),
          originalPath: originalPath,
          filename: filename,
          relativePath: decodedPath,
          hash: match[2],
          platforms: new Set(),
        };

        assetsMap.set(key, asset);
      }
      assetsMap.get(key).platforms.add(platform);
    }
  };

  extractFromBundle(bundles.ios, "ios");
  extractFromBundle(bundles.android, "android");

  return Array.from(assetsMap.values());
}

async function downloadAssets(assets, timestamp) {
  if (assets.length === 0) {
    return 0;
  }

  console.log("Copying assets...");
  let successCount = 0;
  const failures = [];

  const downloadPromises = assets.map(async (asset) => {
    const tempUrl = new URL(`${metroBaseUrl}${asset.originalPath}`);
    const unstablePath = tempUrl.searchParams.get("unstable_path");

    if (!unstablePath) {
      throw new Error(`Asset missing unstable_path: ${asset.originalPath}`);
    }

    const decodedPath = decodeURIComponent(unstablePath);

    try {
      const candidates = [
        path.join(projectRoot, decodedPath, asset.filename),
        path.join(workspaceRoot, decodedPath, asset.filename),
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      if (!found) {
        throw new Error(`Asset not found on disk: ${asset.filename}`);
      }

      for (const outputPrefix of ["", "static"]) {
        const outputDir = path.join(
          projectRoot,
          "static-build",
          outputPrefix,
          timestamp,
          "_expo",
          "static",
          "js",
          asset.relativePath,
        );
        fs.mkdirSync(outputDir, { recursive: true });
        fs.copyFileSync(found, path.join(outputDir, asset.filename));
      }
      successCount++;
    } catch (error) {
      failures.push({
        filename: asset.filename,
        error: error.message,
        url: asset.originalPath,
      });
    }
  });

  await Promise.all(downloadPromises);

  if (failures.length > 0) {
    const errorMsg =
      `Failed to download ${failures.length} asset(s):\n` +
      failures
        .map((f) => `  - ${f.filename}: ${f.error} (${f.url})`)
        .join("\n");
    exitWithError(errorMsg);
  }

  console.log(`Copied ${successCount} assets`);
  return successCount;
}

function rewriteBundleAssetUrls(bundle, timestamp, assetUrlBase, assetBasePath) {
  return bundle.replace(
    /httpServerLocation:"(\/[^"]+)"/g,
    (_match, capturedPath) => {
      const tempUrl = new URL(`${metroBaseUrl}${capturedPath}`);
      const unstablePath = tempUrl.searchParams.get("unstable_path");

      if (!unstablePath) {
        throw new Error(
          `Asset missing unstable_path in bundle: ${capturedPath}`,
        );
      }

      const decodedPath = decodeURIComponent(unstablePath);
      return `httpServerLocation:"${assetUrlBase}${assetBasePath}/${timestamp}/_expo/static/js/${decodedPath}"`;
    },
  );
}

function writeBundleVariants(timestamp, baseUrl) {
  for (const platform of ["ios", "android"]) {
    const bundlePath = path.join(
      projectRoot,
      "static-build",
      timestamp,
      "_expo",
      "static",
      "js",
      platform,
      "bundle.js",
    );
    const source = fs.readFileSync(bundlePath, "utf-8");
    fs.writeFileSync(
      bundlePath,
      rewriteBundleAssetUrls(source, timestamp, baseUrl, basePath),
    );

    const staticBundlePath = path.join(
      projectRoot,
      "static-build",
      "static",
      timestamp,
      "_expo",
      "static",
      "js",
      platform,
      "bundle.js",
    );
    fs.mkdirSync(path.dirname(staticBundlePath), { recursive: true });
    fs.writeFileSync(
      staticBundlePath,
      rewriteBundleAssetUrls(
        source,
        timestamp,
        staticAssetBaseUrl || baseUrl,
        staticAssetBasePath,
      ),
    );
  }
  console.log("Wrote Node and static bundle variants");
}

function updateManifests(manifests, timestamp, baseUrl, assetsByHash) {
  const writeVariant = (
    platform,
    sourceManifest,
    outputPath,
    assetUrlBase,
    assetBasePath,
  ) => {
    const manifest = structuredClone(sourceManifest);
    if (!manifest.launchAsset || !manifest.extra) {
      exitWithError(`Malformed manifest for ${platform}`);
    }

    manifest.launchAsset.url = `${assetUrlBase}${assetBasePath}/${timestamp}/_expo/static/js/${platform}/bundle.js`;
    manifest.launchAsset.key = `bundle-${timestamp}`;
    manifest.createdAt = new Date(
      Number(timestamp.split("-")[0]),
    ).toISOString();
    manifest.extra.expoClient.hostUri =
      baseUrl.replace("https://", "") + "/" + platform;
    manifest.extra.expoGo.debuggerHost =
      baseUrl.replace("https://", "") + "/" + platform;
    manifest.extra.expoGo.packagerOpts.dev = false;

    if (manifest.assets && manifest.assets.length > 0) {
      manifest.assets.forEach((asset) => {
        if (!asset.url) return;

        const hash = asset.hash;
        if (!hash) return;

        const assetInfo = assetsByHash.get(hash);
        if (!assetInfo) return;

        asset.url = `${assetUrlBase}${assetBasePath}/${timestamp}/_expo/static/js/${assetInfo.relativePath}/${assetInfo.filename}`;
      });
    }

    const manifestPath = path.join(projectRoot, "static-build", outputPath);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  };

  for (const platform of ["ios", "android"]) {
    writeVariant(
      platform,
      manifests[platform],
      path.join(platform, "manifest.json"),
      baseUrl,
      basePath,
    );
    writeVariant(
      platform,
      manifests[platform],
      path.join(platform, "manifest-static.json"),
      staticAssetBaseUrl || baseUrl,
      staticAssetBasePath,
    );
    writeVariant(
      platform,
      manifests[platform],
      path.join("static", platform, "manifest.json"),
      staticAssetBaseUrl || baseUrl,
      staticAssetBasePath,
    );
  }
  console.log("Wrote Node and static manifest variants");
}

function writeStaticLandingPage(baseUrl, domain, appName) {
  const templatePath = path.join(
    projectRoot,
    "server",
    "templates",
    "landing-page.html",
  );
  const template = fs.readFileSync(templatePath, "utf-8");
  const html = template
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, domain)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  for (const outputPath of [
    path.join(projectRoot, "static-build", "index.html"),
    path.join(projectRoot, "static-build", "static", "index.html"),
  ]) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, html);
  }
}

function getAppName() {
  try {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "app.json"), "utf-8"),
    );
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function isCompressibleFile(filePath) {
  return new Set([".css", ".html", ".js", ".json", ".map", ".svg"]).has(
    path.extname(filePath).toLowerCase(),
  );
}

function walkFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function precompressStaticFiles() {
  const staticRoot = path.join(projectRoot, "static-build");
  let compressedCount = 0;

  for (const filePath of walkFiles(staticRoot)) {
    if (
      !isCompressibleFile(filePath) ||
      filePath.endsWith(".br") ||
      filePath.endsWith(".gz")
    ) {
      continue;
    }

    const source = fs.readFileSync(filePath);
    if (source.length < 256) continue;

    fs.writeFileSync(`${filePath}.br`, zlib.brotliCompressSync(source));
    fs.writeFileSync(`${filePath}.gz`, zlib.gzipSync(source, { level: 9 }));
    compressedCount++;
  }

  console.log(`Precompressed ${compressedCount} text asset(s)`);
}

async function main() {
  console.log("Building static Expo Go deployment...");
  const buildStartedAt = phaseTimer();

  setupSignalHandlers();

  const domain = getDeploymentDomain();
  const expoPublicReplId = getExpoPublicReplId();
  const baseUrl = `https://${domain}`;
  const timestamp = `${Date.now()}-${process.pid}`;
  const cacheFingerprint = metroCacheFingerprint(domain, expoPublicReplId);
  const cacheReuse = prepareMetroCache(cacheFingerprint);

  let startedAt = phaseTimer();
  prepareDirectories(timestamp);
  reportPhase("prepare-output", startedAt);

  await startMetro(domain, expoPublicReplId);

  const downloadTimeout = 600000;
  const downloadPromise = downloadBundlesAndManifests(timestamp);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Overall download timeout after ${downloadTimeout / 1000} seconds. ` +
            "Metro may be struggling to generate bundles. Check Metro logs above.",
        ),
      );
    }, downloadTimeout);
  });

  const manifests = await Promise.race([downloadPromise, timeoutPromise]);

  startedAt = phaseTimer();
  console.log("Processing assets...");
  const assets = extractAssets(timestamp);
  console.log("Found", assets.length, "unique asset(s)");

  const assetsByHash = new Map();
  for (const asset of assets) {
    assetsByHash.set(asset.hash, {
      relativePath: asset.relativePath,
      filename: asset.filename,
    });
  }

  const assetCount = await downloadAssets(assets, timestamp);
  writeBundleVariants(timestamp, baseUrl);
  reportPhase("asset-processing", startedAt, { assetCount });

  startedAt = phaseTimer();
  console.log("Updating manifests and creating landing page...");
  updateManifests(manifests, timestamp, baseUrl, assetsByHash);
  writeStaticLandingPage(baseUrl, domain, getAppName());
  reportPhase("manifest-generation", startedAt);

  startedAt = phaseTimer();
  precompressStaticFiles();
  reportPhase("compression", startedAt);

  recordSuccessfulMetroCache(cacheFingerprint);
  reportPhase("mobile-build", buildStartedAt, {
    cacheReuse,
    assetCount,
    status: "complete",
  });

  console.log("Build complete! Deploy to:", baseUrl);

  if (metroProcess) {
    metroProcess.kill();
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("Build failed:", error.message);
  if (metroProcess) {
    metroProcess.kill();
  }
  process.exit(1);
});
