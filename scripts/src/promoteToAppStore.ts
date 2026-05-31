import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const APP_JSON_PATH = path.join(REPO_ROOT, "artifacts/presentail/app.json");
const EAS_JSON_PATH = path.join(REPO_ROOT, "artifacts/presentail/eas.json");
const APP_STORE_METADATA_PATH = path.join(
  REPO_ROOT,
  "artifacts/presentail/app-store-metadata.json",
);
const APP_STORE_SUBTITLE_MAX_LENGTH = 30;

const ASC_BASE = "https://api.appstoreconnect.apple.com";
const PLATFORM = "IOS";

type Json = Record<string, unknown>;

type AscResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
};

type AscList<T = AscResource> = {
  data: T[];
  links?: { next?: string };
};

type AscSingle<T = AscResource> = { data: T };

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function generateAscToken(): string {
  const keyId = requireEnv("ASC_API_KEY_ID");
  const issuerId = requireEnv("ASC_API_KEY_ISSUER_ID");
  let privateKeyPem = process.env.ASC_API_KEY_P8;
  if (!privateKeyPem || !privateKeyPem.trim()) {
    const keyPath = process.env.ASC_API_KEY_PATH;
    if (!keyPath) {
      throw new Error(
        "Missing ASC_API_KEY_P8 (PEM contents) or ASC_API_KEY_PATH (file path).",
      );
    }
    privateKeyPem = fs.readFileSync(keyPath, "utf8");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 19 * 60,
    aud: "appstoreconnect-v1",
  };
  const b64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const keyObj = crypto.createPrivateKey(privateKeyPem);
  const derSig = crypto.sign("SHA256", Buffer.from(signingInput), keyObj);
  // Convert DER ECDSA signature to JOSE (r||s) form, 64 bytes
  const joseSig = derToJose(derSig, 32);
  const sigB64 = joseSig
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${signingInput}.${sigB64}`;
}

function derToJose(der: Buffer, partSize: number): Buffer {
  // DER: 0x30 b1 0x02 b2 r 0x02 b3 s
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error("Bad DER signature");
  if (der[offset] & 0x80) {
    offset += 1 + (der[offset] & 0x7f);
  } else {
    offset += 1;
  }
  if (der[offset++] !== 0x02) throw new Error("Bad DER signature (r)");
  const rLen = der[offset++];
  let r = der.subarray(offset, offset + rLen);
  offset += rLen;
  if (der[offset++] !== 0x02) throw new Error("Bad DER signature (s)");
  const sLen = der[offset++];
  let s = der.subarray(offset, offset + sLen);
  const trimZeros = (b: Buffer) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0x00) i++;
    return b.subarray(i);
  };
  r = trimZeros(r);
  s = trimZeros(s);
  const pad = (b: Buffer) => {
    if (b.length > partSize) throw new Error("Signature part too large");
    if (b.length === partSize) return b;
    const out = Buffer.alloc(partSize);
    b.copy(out, partSize - b.length);
    return out;
  };
  return Buffer.concat([pad(r), pad(s)]);
}

class AscClient {
  constructor(private token: string) {}

  async request<T = AscResource>(
    method: string,
    pathOrUrl: string,
    body?: Json,
  ): Promise<T> {
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${ASC_BASE}${pathOrUrl}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `ASC ${method} ${url} failed: ${res.status} ${res.statusText}\n${text}`,
      );
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  get<T = AscResource>(p: string) {
    return this.request<T>("GET", p);
  }
  post<T = AscResource>(p: string, body: Json) {
    return this.request<T>("POST", p, body);
  }
  patch<T = AscResource>(p: string, body: Json) {
    return this.request<T>("PATCH", p, body);
  }
}

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

async function findBuild(
  client: AscClient,
  ascAppId: string,
  buildNumber: string | null,
): Promise<AscResource> {
  if (buildNumber) {
    const list = await client.get<AscList>(
      `/v1/builds?filter[app]=${ascAppId}` +
        `&filter[preReleaseVersion.platform]=${PLATFORM}` +
        `&filter[version]=${encodeURIComponent(buildNumber)}` +
        `&sort=-uploadedDate&limit=5`,
    );
    if (list.data.length === 0) {
      throw new Error(
        `No build found in App Store Connect with build number "${buildNumber}".`,
      );
    }
    return list.data[0];
  }
  const list = await client.get<AscList>(
    `/v1/builds?filter[app]=${ascAppId}` +
      `&filter[preReleaseVersion.platform]=${PLATFORM}` +
      `&filter[processingState]=VALID` +
      `&sort=-uploadedDate&limit=1`,
  );
  if (list.data.length === 0) {
    throw new Error("No VALID iOS builds found in App Store Connect.");
  }
  return list.data[0];
}

async function getBuildUsesNonExemptEncryption(
  client: AscClient,
  buildId: string,
): Promise<boolean | null> {
  const detail = await client.get<AscSingle>(`/v1/builds/${buildId}`);
  const attrs = (detail.data.attributes ?? {}) as {
    usesNonExemptEncryption?: boolean | null;
  };
  return attrs.usesNonExemptEncryption ?? null;
}

async function mirrorExportCompliance(
  client: AscClient,
  buildId: string,
  desired: boolean,
  source: string,
): Promise<void> {
  const current = await getBuildUsesNonExemptEncryption(client, buildId);
  if (current === desired) {
    log(
      `Build ${buildId} already declares usesNonExemptEncryption=${desired} ` +
        `(mirrored from ${source}).`,
    );
    return;
  }
  log(
    `Setting usesNonExemptEncryption=${desired} on build ${buildId} ` +
      `(was ${String(current)}, mirrored from ${source}).`,
  );
  await client.patch(`/v1/builds/${buildId}`, {
    data: {
      type: "builds",
      id: buildId,
      attributes: { usesNonExemptEncryption: desired },
    },
  });
}

async function findPreviousRelease(
  client: AscClient,
  ascAppId: string,
): Promise<AscResource | null> {
  const list = await client.get<AscList>(
    `/v1/apps/${ascAppId}/appStoreVersions` +
      `?filter[platform]=${PLATFORM}` +
      `&filter[appStoreState]=READY_FOR_SALE,REPLACED_WITH_NEW_VERSION` +
      `&sort=-createdDate&limit=1`,
  );
  return list.data[0] ?? null;
}

async function getPreviousReleaseBuildCompliance(
  client: AscClient,
  previousVersionId: string,
): Promise<{ value: boolean; buildId: string } | null> {
  const rel = await client.get<{ data: { id: string; type: string } | null }>(
    `/v1/appStoreVersions/${previousVersionId}/relationships/build`,
  );
  const buildId = rel.data?.id;
  if (!buildId) return null;
  const value = await getBuildUsesNonExemptEncryption(client, buildId);
  if (value === null) return null;
  return { value, buildId };
}

async function findEditableVersion(
  client: AscClient,
  ascAppId: string,
  versionString: string,
): Promise<AscResource | null> {
  const list = await client.get<AscList>(
    `/v1/apps/${ascAppId}/appStoreVersions` +
      `?filter[platform]=${PLATFORM}` +
      `&filter[versionString]=${encodeURIComponent(versionString)}` +
      `&limit=5`,
  );
  return list.data[0] ?? null;
}

async function createOrUpdateVersion(
  client: AscClient,
  ascAppId: string,
  versionString: string,
  releaseType: string,
): Promise<AscResource> {
  const existing = await findEditableVersion(client, ascAppId, versionString);
  if (existing) {
    log(
      `Found existing App Store version ${versionString} (id=${existing.id}, state=${String(existing.attributes?.appStoreState)}). Updating release type to ${releaseType}.`,
    );
    await client.patch(`/v1/appStoreVersions/${existing.id}`, {
      data: {
        type: "appStoreVersions",
        id: existing.id,
        attributes: { releaseType },
      },
    });
    return existing;
  }
  log(`Creating new App Store version ${versionString} (releaseType=${releaseType}).`);
  const created = await client.post<AscSingle>(`/v1/appStoreVersions`, {
    data: {
      type: "appStoreVersions",
      attributes: {
        platform: PLATFORM,
        versionString,
        releaseType,
      },
      relationships: {
        app: { data: { type: "apps", id: ascAppId } },
      },
    },
  });
  return created.data;
}

async function attachBuildToVersion(
  client: AscClient,
  versionId: string,
  buildId: string,
): Promise<void> {
  log(`Attaching build ${buildId} to version ${versionId}.`);
  await client.patch(
    `/v1/appStoreVersions/${versionId}/relationships/build`,
    { data: { type: "builds", id: buildId } },
  );
}

function loadSubtitle(): string {
  let raw: string;
  try {
    raw = fs.readFileSync(APP_STORE_METADATA_PATH, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read App Store metadata file at ${APP_STORE_METADATA_PATH}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  let parsed: { subtitle?: unknown };
  try {
    parsed = JSON.parse(raw) as { subtitle?: unknown };
  } catch (err) {
    throw new Error(
      `App Store metadata file at ${APP_STORE_METADATA_PATH} is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const subtitle = parsed.subtitle;
  if (typeof subtitle !== "string") {
    throw new Error(
      `App Store metadata file at ${APP_STORE_METADATA_PATH} must contain a string "subtitle" field.`,
    );
  }
  if (subtitle.length === 0) {
    throw new Error(
      `App Store "subtitle" in ${APP_STORE_METADATA_PATH} must not be empty.`,
    );
  }
  if (subtitle.length > APP_STORE_SUBTITLE_MAX_LENGTH) {
    throw new Error(
      `App Store "subtitle" in ${APP_STORE_METADATA_PATH} is ${subtitle.length} characters long; ` +
        `the App Store hard limit is ${APP_STORE_SUBTITLE_MAX_LENGTH}. Shorten "${subtitle}" before promoting.`,
    );
  }
  if (subtitle !== subtitle.trim()) {
    throw new Error(
      `App Store "subtitle" in ${APP_STORE_METADATA_PATH} has leading or trailing whitespace; ` +
        `trim "${subtitle}" before promoting.`,
    );
  }
  return subtitle;
}

async function setSubtitle(
  client: AscClient,
  versionId: string,
  subtitle: string,
): Promise<{ locale: string; subtitle: string }[]> {
  const list = await client.get<AscList>(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`,
  );
  if (list.data.length === 0) {
    throw new Error(
      `No localizations found on App Store version ${versionId}; cannot set subtitle.`,
    );
  }
  const rendered: { locale: string; subtitle: string }[] = [];
  for (const loc of list.data) {
    const locale = (loc.attributes?.locale as string) ?? "(unknown)";
    log(`Updating subtitle for locale ${locale} (id=${loc.id}).`);
    let updated: AscSingle;
    try {
      updated = await client.patch<AscSingle>(
        `/v1/appStoreVersionLocalizations/${loc.id}`,
        {
          data: {
            type: "appStoreVersionLocalizations",
            id: loc.id,
            attributes: { subtitle },
          },
        },
      );
    } catch (err) {
      throw new Error(
        `App Store Connect rejected the subtitle for locale "${locale}" ` +
          `(localization id=${loc.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
      );
    }
    const written =
      ((updated.data.attributes ?? {}) as { subtitle?: string }).subtitle ??
      subtitle;
    rendered.push({ locale, subtitle: written });
  }
  return rendered;
}

async function setReleaseNotes(
  client: AscClient,
  versionId: string,
  notes: string,
): Promise<{ locale: string; whatsNew: string }[]> {
  const list = await client.get<AscList>(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`,
  );
  if (list.data.length === 0) {
    throw new Error(
      `No localizations found on App Store version ${versionId}; cannot set release notes.`,
    );
  }
  const rendered: { locale: string; whatsNew: string }[] = [];
  for (const loc of list.data) {
    const locale = (loc.attributes?.locale as string) ?? "(unknown)";
    log(`Updating release notes for locale ${locale} (id=${loc.id}).`);
    const updated = await client.patch<AscSingle>(
      `/v1/appStoreVersionLocalizations/${loc.id}`,
      {
        data: {
          type: "appStoreVersionLocalizations",
          id: loc.id,
          attributes: { whatsNew: notes },
        },
      },
    );
    const whatsNew =
      ((updated.data.attributes ?? {}) as { whatsNew?: string }).whatsNew ?? notes;
    rendered.push({ locale, whatsNew });
  }
  return rendered;
}

async function submitForReview(
  client: AscClient,
  versionId: string,
): Promise<AscResource> {
  log(`Submitting App Store version ${versionId} for review.`);
  const submission = await client.post<AscSingle>(
    `/v1/appStoreVersionSubmissions`,
    {
      data: {
        type: "appStoreVersionSubmissions",
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId },
          },
        },
      },
    },
  );
  return submission.data;
}

export function validateReleaseNotes(notes: string, isSubmit: boolean): void {
  if (isSubmit && notes.toLowerCase().startsWith("todo:")) {
    throw new Error(
      `PROMOTE_RELEASE_NOTES looks like placeholder text ("${notes.slice(0, 60)}…"). ` +
        `Replace it with real release notes before running in submit mode.`,
    );
  }
}

async function main(): Promise<void> {
  const buildNumberInput = (process.env.PROMOTE_BUILD_NUMBER ?? "").trim();
  const buildNumber =
    buildNumberInput && buildNumberInput.toLowerCase() !== "latest"
      ? buildNumberInput
      : null;
  const releaseNotes = (
    process.env.PROMOTE_RELEASE_NOTES ?? ""
  ).trim();
  if (!releaseNotes) {
    throw new Error("PROMOTE_RELEASE_NOTES is required (the What's New text).");
  }
  const modeInput = (process.env.PROMOTE_MODE ?? "dry-run").trim().toLowerCase();
  if (modeInput !== "dry-run" && modeInput !== "submit") {
    throw new Error(
      `PROMOTE_MODE must be "dry-run" or "submit" (got "${modeInput}").`,
    );
  }
  const dryRun = modeInput === "dry-run";

  validateReleaseNotes(releaseNotes, !dryRun);

  const subtitle = loadSubtitle();
  log(
    `App Store subtitle (from ${path.relative(REPO_ROOT, APP_STORE_METADATA_PATH)}): ` +
      `"${subtitle}" (${subtitle.length}/${APP_STORE_SUBTITLE_MAX_LENGTH} chars).`,
  );

  const appJson = readJson<{ expo: { version: string } }>(APP_JSON_PATH);
  const easJson = readJson<{
    submit: { production: { ios: { ascAppId: string } } };
  }>(EAS_JSON_PATH);
  const versionString = appJson.expo.version;
  const ascAppId = easJson.submit.production.ios.ascAppId;
  if (!versionString) throw new Error("Could not read expo.version from app.json.");
  if (!ascAppId)
    throw new Error("Could not read submit.production.ios.ascAppId from eas.json.");

  log(
    `Promoting to App Store: app ${ascAppId}, version ${versionString} ` +
      `(mode=${dryRun ? "dry-run" : "submit"}).`,
  );
  if (dryRun) {
    log(
      "Dry-run mode: the version will be prepared, the build attached, " +
        "and release notes written, but the version will NOT be submitted " +
        "for App Review. Re-run the workflow in 'submit' mode to send it.",
    );
  }
  log(
    buildNumber
      ? `Target build: ${buildNumber}.`
      : `Target build: latest VALID iOS build.`,
  );

  const token = generateAscToken();
  const client = new AscClient(token);

  const build = await findBuild(client, ascAppId, buildNumber);
  const buildVersion = (build.attributes?.version as string) ?? "?";
  log(`Resolved build ${build.id} (build number ${buildVersion}).`);

  if (buildNumber) {
    const processingState = (build.attributes?.processingState as string) ?? null;
    if (processingState && processingState !== "VALID") {
      throw new Error(
        `Build ${buildNumber} (id=${build.id}) has processingState=${processingState}; ` +
          `it must be VALID before it can be submitted for App Review.`,
      );
    }
  }

  const previousRelease = await findPreviousRelease(client, ascAppId);
  const previousReleaseType =
    (previousRelease?.attributes?.releaseType as string) ?? null;
  const releaseType = previousReleaseType ?? "AFTER_APPROVAL";
  log(
    previousRelease
      ? `Mirroring previous release type from version ${previousRelease.id}: ${releaseType}.`
      : `No previous release found; defaulting release type to ${releaseType}.`,
  );

  let exportComplianceValue = false;
  let exportComplianceSource = "default (no previous release found)";
  if (previousRelease) {
    const prev = await getPreviousReleaseBuildCompliance(
      client,
      previousRelease.id,
    );
    if (prev) {
      exportComplianceValue = prev.value;
      exportComplianceSource = `previous release build ${prev.buildId}`;
    } else {
      exportComplianceSource = `previous release ${previousRelease.id} had no readable build compliance; falling back to default`;
    }
  }
  log(
    `Export compliance to apply: usesNonExemptEncryption=${exportComplianceValue} ` +
      `(source: ${exportComplianceSource}).`,
  );
  await mirrorExportCompliance(
    client,
    build.id,
    exportComplianceValue,
    exportComplianceSource,
  );

  const version = await createOrUpdateVersion(
    client,
    ascAppId,
    versionString,
    releaseType,
  );

  await attachBuildToVersion(client, version.id, build.id);
  const renderedSubtitle = await setSubtitle(client, version.id, subtitle);
  const renderedNotes = await setReleaseNotes(client, version.id, releaseNotes);

  log("");
  log("=== Rendered subtitle (as App Store has it now) ===");
  for (const { locale, subtitle: written } of renderedSubtitle) {
    log(`--- ${locale} --- ${written}`);
  }
  log("=== end of rendered subtitle ===");
  log("");
  log("=== Rendered release notes (as App Store has them now) ===");
  for (const { locale, whatsNew } of renderedNotes) {
    log(`--- ${locale} ---`);
    log(whatsNew);
  }
  log("=== end of rendered release notes ===");
  log("");

  const submission = dryRun
    ? null
    : await submitForReview(client, version.id);

  const refreshed = await client.get<AscSingle>(
    `/v1/appStoreVersions/${version.id}`,
  );
  const finalState =
    (refreshed.data.attributes?.appStoreState as string) ?? "(unknown)";
  const ascLink = `https://appstoreconnect.apple.com/apps/${ascAppId}/appstore/ios/version/${version.id}`;

  log("");
  log(
    dryRun
      ? "=== App Store promotion DRY RUN complete (NOT submitted for review) ==="
      : "=== App Store promotion complete ===",
  );
  log(`App Store version : ${versionString} (id=${version.id})`);
  log(`Build number      : ${buildVersion} (id=${build.id})`);
  log(`Release type      : ${releaseType}`);
  log(`Export compliance : usesNonExemptEncryption=${exportComplianceValue} (source: ${exportComplianceSource})`);
  log(`Subtitle          : "${subtitle}" (${subtitle.length}/${APP_STORE_SUBTITLE_MAX_LENGTH} chars)`);
  log(`Submission id     : ${submission ? submission.id : "(dry-run, not submitted)"}`);
  log(`Review state      : ${finalState}`);
  log(`ASC link          : ${ascLink}`);
  if (dryRun) {
    log("");
    log(
      "Next step: review the rendered release notes above. If they look right, " +
        "re-run this workflow with the same inputs and mode=submit to send the " +
        "version for App Review.",
    );
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const escape = (s: string) => s.replace(/\|/g, "\\|");
    const notesBlock = renderedNotes
      .map(
        ({ locale, whatsNew }) =>
          `<details><summary><code>${escape(locale)}</code></summary>\n\n` +
          "```\n" +
          whatsNew +
          "\n```\n\n</details>",
      )
      .join("\n");
    const subtitleRows = renderedSubtitle
      .map(
        ({ locale, subtitle: written }) =>
          `| \`${escape(locale)}\` | ${escape(written)} |`,
      )
      .join("\n");
    const heading = dryRun
      ? `## App Store promotion — DRY RUN (not submitted)`
      : `## App Store promotion submitted`;
    const lines = [
      heading,
      ``,
      `- **Mode**: \`${dryRun ? "dry-run" : "submit"}\``,
      `- **Version**: \`${versionString}\``,
      `- **Build**: \`${buildVersion}\``,
      `- **Release type**: \`${releaseType}\``,
      `- **Export compliance**: \`usesNonExemptEncryption=${exportComplianceValue}\` (source: ${exportComplianceSource})`,
      `- **Subtitle**: \`${subtitle}\` (${subtitle.length}/${APP_STORE_SUBTITLE_MAX_LENGTH} chars, from \`${path.relative(REPO_ROOT, APP_STORE_METADATA_PATH)}\`)`,
      `- **Review state**: \`${finalState}\``,
      `- **Submission id**: \`${submission ? submission.id : "(dry-run, not submitted)"}\``,
      `- **ASC**: ${ascLink}`,
      ``,
      `### Rendered subtitle per locale`,
      ``,
      `| Locale | Subtitle |`,
      `| --- | --- |`,
      subtitleRows,
      ``,
      `### Rendered release notes per locale`,
      ``,
      notesBlock,
      ``,
    ];
    if (dryRun) {
      lines.push(
        `> Re-run this workflow with the same inputs and **mode=submit** to send for App Review.`,
        ``,
      );
    }
    fs.appendFileSync(summaryPath, lines.join("\n"));
  }
}

const isMain =
  process.argv[1] &&
  url.fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
