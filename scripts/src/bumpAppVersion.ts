import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const APP_JSON_PATH = path.join(REPO_ROOT, "artifacts/presentail/app.json");

type AppJson = { expo: { version: string } } & Record<string, unknown>;

function bumpPatch(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version.trim());
  if (!m) {
    throw new Error(
      `Cannot bump version "${version}": expected MAJOR.MINOR.PATCH format.`,
    );
  }
  const [, major, minor, patch, suffix] = m;
  const next = `${major}.${minor}.${Number(patch) + 1}${suffix}`;
  return next;
}

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function main(): void {
  const raw = fs.readFileSync(APP_JSON_PATH, "utf8");
  const appJson = JSON.parse(raw) as AppJson;
  const current = appJson.expo?.version;
  if (!current) {
    throw new Error("Could not read expo.version from app.json.");
  }
  const next = bumpPatch(current);
  if (next === current) {
    throw new Error(`Bumped version equals current version (${current}).`);
  }

  appJson.expo.version = next;

  // Preserve trailing newline if present, and 2-space indent (matches existing file).
  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(
    APP_JSON_PATH,
    JSON.stringify(appJson, null, 2) + trailingNewline,
  );

  log(`Bumped expo.version: ${current} -> ${next}`);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    fs.appendFileSync(
      githubOutput,
      `previous_version=${current}\nnext_version=${next}\n`,
    );
  }
}

main();
