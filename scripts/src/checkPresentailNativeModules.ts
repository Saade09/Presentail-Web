import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const APP_DIR = path.join(REPO_ROOT, "artifacts/presentail");
const APP_PKG_PATH = path.join(APP_DIR, "package.json");
const APP_NM_DIR = path.join(APP_DIR, "node_modules");
const SHIPPED_PATH = path.join(APP_DIR, "shipped-native-modules.json");
const SCAN_DIRS = ["app", "components", "contexts", "hooks", "lib"];

type ShippedFile = { _comment?: string; modules: string[] };

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function listDirectDeps(): string[] {
  const pkg = readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(APP_PKG_PATH);
  return Array.from(
    new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]),
  ).sort();
}

function packageDir(name: string, nmDir: string = APP_NM_DIR): string | null {
  const dir = path.join(nmDir, name);
  if (!fs.existsSync(dir)) return null;
  // Resolve through symlink so we look at the real package, not the link.
  try {
    const real = fs.realpathSync(dir);
    return real;
  } catch {
    return dir;
  }
}

/**
 * Determine whether a package directory contains native iOS/Android code.
 *
 * Heuristics (checked in order):
 *   1. expo-module.config.json present → native Expo module.
 *   2. A *.podspec file at the package root → CocoaPods native library.
 *   3. A non-empty `ios/` subdirectory → hand-written iOS native code.
 *   4. An `android/` subdirectory containing build.gradle or src/ → Android native code.
 *
 * Exported so unit tests can exercise it against synthetic fixture directories
 * without touching the real node_modules tree.
 */
export function isNativeDir(dir: string): boolean {
  if (fs.existsSync(path.join(dir, "expo-module.config.json"))) return true;
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return false;
  }
  if (entries.some((f) => f.endsWith(".podspec"))) return true;
  const iosDir = path.join(dir, "ios");
  if (fs.existsSync(iosDir)) {
    try {
      if (fs.readdirSync(iosDir).length > 0) return true;
    } catch {
      /* ignore */
    }
  }
  const androidDir = path.join(dir, "android");
  if (fs.existsSync(androidDir)) {
    try {
      const sub = fs.readdirSync(androidDir);
      if (sub.some((f) => f === "build.gradle" || f === "src")) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function isNativePackage(name: string): boolean {
  const dir = packageDir(name);
  if (!dir) return false;
  return isNativeDir(dir);
}

function getCurrentNativeModules(): string[] {
  if (!fs.existsSync(APP_NM_DIR)) {
    throw new Error(
      `Cannot detect native modules: ${APP_NM_DIR} does not exist. Run \`pnpm install\` first.`,
    );
  }
  return listDirectDeps().filter(isNativePackage).sort();
}

function* walk(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(?:tsx?|jsx?)$/.test(entry.name)) {
      yield full;
    }
  }
}

// Top-level static import / require detection. Anchored to start-of-line
// (multiline mode) so that lazy `await import("...")` calls and `require(...)`
// invocations inside indented try/catch blocks are NOT treated as offenders.
// Excludes `import type ... from "..."`: type-only imports are erased at
// build time and cannot trigger a missing-native-module crash at runtime.
const STATIC_IMPORT_FROM_RE =
  /^import\b(?!\s+type\b)[^;]*?from\s*["']([^"']+)["']/gm;
const STATIC_SIDE_EFFECT_IMPORT_RE = /^import\s*["']([^"']+)["']/gm;
const TOP_LEVEL_REQUIRE_RE =
  /^(?:export\s+)?(?:const|let|var)\b[^=]*=\s*require\(\s*["']([^"']+)["']\s*\)/gm;

/**
 * Resolve a module specifier to its root package name.
 *
 * Examples:
 *   "react-native"              → "react-native"
 *   "react-native/Libraries/…" → "react-native"
 *   "@expo/vector-icons"        → "@expo/vector-icons"
 *   "@expo/vector-icons/…"      → "@expo/vector-icons"
 *   "@scope"                    → "@scope"  (bare scope, unusual but handled)
 *
 * Exported so unit tests can verify the scoped-package edge cases without
 * running the full check pipeline.
 */
export function rootSpecifier(spec: string): string {
  if (spec.startsWith("@")) {
    const [scope, name] = spec.split("/");
    return name ? `${scope}/${name}` : scope;
  }
  return spec.split("/")[0];
}

/**
 * Scan `file` for top-level static imports / requires of any module in
 * `watched` and return the matched package names, sorted.
 *
 * "Top-level" means anchored to the start of a line (multiline mode).
 * Lazy `await import(...)` calls and indented `require(...)` inside
 * try/catch blocks are intentionally ignored — those are safe patterns
 * for not-yet-shipped native modules.
 *
 * Exported so unit tests can exercise the regex logic against synthetic
 * fixture files without triggering the full check pipeline.
 */
export function findOffendingImports(
  file: string,
  watched: Set<string>,
): string[] {
  const content = fs.readFileSync(file, "utf8");
  const hits = new Set<string>();
  for (const re of [
    STATIC_IMPORT_FROM_RE,
    STATIC_SIDE_EFFECT_IMPORT_RE,
    TOP_LEVEL_REQUIRE_RE,
  ]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const root = rootSpecifier(m[1]);
      if (watched.has(root)) hits.add(root);
    }
  }
  return Array.from(hits).sort();
}

const SHIPPED_COMMENT =
  "Native modules (packages with native iOS/Android code) that were compiled into the most recently shipped TestFlight / App Store / Google Play build of the Presentail mobile app. The check-presentail-native-modules script compares this list against the native modules currently declared in artifacts/presentail/package.json. Any new entry that is not yet in this file MUST be lazy-loaded (await import / try { require } catch) in the JS layer until a fresh EAS build has been submitted, otherwise the app will crash on older TestFlight binaries the moment a screen importing it is opened. This file is regenerated automatically by the `iOS – Build & Submit to TestFlight` and `Android – Build & Submit to Google Play` GitHub Actions workflows after every successful EAS production build (they run `pnpm --filter @workspace/scripts run write-presentail-native-modules` and open a PR with the diff). You can also re-run it locally with the same command if you ever need to refresh the baseline by hand.";

function writeBaseline(): void {
  const current = getCurrentNativeModules();
  let existingComment = SHIPPED_COMMENT;
  try {
    const existing = readJson<ShippedFile>(SHIPPED_PATH);
    if (existing._comment) existingComment = existing._comment;
  } catch {
    /* file may not exist yet */
  }
  const next: ShippedFile = {
    _comment: existingComment,
    modules: current,
  };
  fs.writeFileSync(SHIPPED_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${current.length} native modules to ${path.relative(REPO_ROOT, SHIPPED_PATH)}.`,
  );
}

function main(): void {
  if (process.argv.includes("--write")) {
    writeBaseline();
    return;
  }
  const shipped = readJson<ShippedFile>(SHIPPED_PATH);
  const shippedSet = new Set(shipped.modules);
  const current = getCurrentNativeModules();

  const removed = shipped.modules.filter((m) => !current.includes(m));
  const added = current.filter((m) => !shippedSet.has(m));

  if (removed.length > 0) {
    console.warn(
      `WARNING: shipped-native-modules.json lists modules that are no longer present in artifacts/presentail/package.json: ${removed.join(", ")}. Update the file after the next EAS submission.`,
    );
  }

  if (added.length === 0) {
    console.log(
      `OK: no new native modules since last shipped build (${current.length} native modules tracked).`,
    );
    return;
  }

  console.log(
    `Detected ${added.length} new native module(s) since last shipped TestFlight build: ${added.join(", ")}`,
  );

  const watched = new Set(added);
  const offenders: { file: string; modules: string[] }[] = [];

  for (const sub of SCAN_DIRS) {
    const root = path.join(APP_DIR, sub);
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) {
      const hits = findOffendingImports(file, watched);
      if (hits.length > 0) {
        offenders.push({
          file: path.relative(REPO_ROOT, file),
          modules: hits,
        });
      }
    }
  }

  if (offenders.length === 0) {
    console.log(
      "OK: new native modules are not statically imported in app/components/contexts/hooks/lib. Remember to update artifacts/presentail/shipped-native-modules.json after the next EAS submission.",
    );
    return;
  }

  console.error("");
  console.error(
    "ERROR: native modules added since the last shipped TestFlight build are statically imported.",
  );
  console.error(
    "Older TestFlight binaries do not contain the native code for these modules, so any screen reaching one of these imports will crash on launch.",
  );
  console.error(
    "Either ship a fresh EAS build (and then update artifacts/presentail/shipped-native-modules.json) OR lazy-load the module with `await import(...)` inside a try/catch, mirroring the expo-clipboard pattern in artifacts/presentail/app/product/[slug].tsx.",
  );
  console.error("");
  for (const { file, modules } of offenders) {
    for (const mod of modules) {
      console.error(`  - ${file}: imports "${mod}"`);
    }
  }
  console.error("");
  process.exit(1);
}

// Only run main() when this file is executed directly (not when imported by tests).
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(url.fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
