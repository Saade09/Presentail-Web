import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const APP_JSON_PATH = path.join(REPO_ROOT, "artifacts/presentail/app.json");

type AppJson = {
  expo: { android?: { versionCode?: number } };
} & Record<string, unknown>;

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function main(): void {
  const raw = fs.readFileSync(APP_JSON_PATH, "utf8");
  const appJson = JSON.parse(raw) as AppJson;
  const current = appJson.expo?.android?.versionCode;
  if (typeof current !== "number") {
    throw new Error("Could not read expo.android.versionCode from app.json.");
  }
  const next = current + 1;

  appJson.expo.android!.versionCode = next;

  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(
    APP_JSON_PATH,
    JSON.stringify(appJson, null, 2) + trailingNewline,
  );

  log(`Bumped expo.android.versionCode: ${current} -> ${next}`);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    fs.appendFileSync(
      githubOutput,
      `previous_versionCode=${current}\nnext_versionCode=${next}\n`,
    );
  }
}

main();
