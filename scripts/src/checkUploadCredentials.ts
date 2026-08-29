/**
 * Check upload and scratch directories for credentials that must not remain in
 * the workspace.
 *
 * This is intentionally narrower than a source secret scanner. Historical
 * attachments and launch media live in attached_assets/, while temporary
 * uploads may be placed in upload(s), scratch(es), temp, or tmp directories.
 * The check only inspects those locations, so ordinary application JSON and
 * non-secret provenance notes are not treated as credentials.
 *
 * Exit code 0 — no credential-shaped files were found.
 * Exit code 1 — a credential was found or a candidate directory could not be
 * read.
 *
 * Remediation: delete the uploaded copy and put the value in Replit Secrets.
 * The mobile build's existing ignored path
 * artifacts/presentail/google-service-account.json is the only supported
 * file-based exception for the build tooling.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const CANDIDATE_DIRECTORY_RE =
  /^(?:attached_assets|upload|uploads|scratch|scratches|temp|tmp)$/i;

// These directories can contain very large generated or third-party trees.
// Hidden directories are excluded as well; they are agent/tooling state rather
// than user upload locations.
const SKIP_DIRECTORY_NAMES = new Set([
  ".git",
  ".cache",
  ".local",
  ".agents",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".expo",
  ".next",
  "static-build",
  "tmp-dist",
]);

const MAX_SCANNED_FILE_BYTES = 8 * 1024 * 1024;

// Covers PKCS#8, RSA, EC, and OpenSSH PEM encodings without matching ordinary
// prose that merely mentions the words "private key".
export const PRIVATE_KEY_MARKER_RE =
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;

export type CredentialFindingKind =
  | "credential-shaped-json"
  | "private-key-marker";

export interface CredentialFinding {
  /** Workspace-relative path; never includes file contents. */
  file: string;
  kind: CredentialFindingKind;
}

export interface CredentialScanResult {
  findings: CredentialFinding[];
  errors: string[];
  scannedDirectories: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function keyName(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function objectHasKey(
  object: Record<string, unknown>,
  ...wantedKeys: string[]
): boolean {
  const wanted = new Set(wantedKeys.map(keyName));
  return Object.keys(object).some((key) => wanted.has(keyName(key)));
}

function objectHasNonEmptyKey(
  object: Record<string, unknown>,
  ...wantedKeys: string[]
): boolean {
  const wanted = new Set(wantedKeys.map(keyName));
  return Object.entries(object).some(
    ([key, value]) => wanted.has(keyName(key)) && hasNonEmptyString(value),
  );
}

/**
 * Recognize credential JSON by shape rather than by filename. A `private_key`
 * field with a value is sufficient because it is not a normal launch-media or
 * provenance field. The other patterns cover common OAuth and cloud key
 * exports that do not use a PEM private key.
 */
export function isCredentialShapedJson(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(isCredentialShapedJson);
  }
  if (!isPlainObject(value)) return false;

  const hasPrivateKey = objectHasNonEmptyKey(value, "private_key", "privateKey");
  const hasClientEmail = objectHasNonEmptyKey(value, "client_email", "clientEmail");
  const hasServiceAccountType =
    Object.entries(value).some(
      ([key, entryValue]) =>
        keyName(key) === "type" &&
        typeof entryValue === "string" &&
        entryValue.toLowerCase() === "service_account",
    );
  const hasOAuthPair =
    objectHasNonEmptyKey(value, "client_id", "clientId") &&
    objectHasNonEmptyKey(value, "client_secret", "clientSecret") &&
    (objectHasKey(value, "installed", "web", "authorization_uri", "auth_uri") ||
      objectHasKey(value, "token_uri", "redirect_uris"));
  const hasCloudKeyPair =
    objectHasNonEmptyKey(value, "aws_access_key_id", "awsAccessKeyId", "accessKeyId") &&
    objectHasNonEmptyKey(
      value,
      "aws_secret_access_key",
      "awsSecretAccessKey",
      "secretAccessKey",
    );

  if (
    hasPrivateKey ||
    (hasServiceAccountType && hasClientEmail) ||
    (hasOAuthPair && objectHasKey(value, "client_id", "clientId")) ||
    hasCloudKeyPair
  ) {
    return true;
  }

  return Object.values(value).some(isCredentialShapedJson);
}

function relativePath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function addFinding(
  findings: CredentialFinding[],
  file: string,
  kind: CredentialFindingKind,
): void {
  if (!findings.some((finding) => finding.file === file && finding.kind === kind)) {
    findings.push({ file, kind });
  }
}

function inspectFile(
  rootDir: string,
  filePath: string,
  findings: CredentialFinding[],
  errors: string[],
): void {
  let content: string;
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_SCANNED_FILE_BYTES) return;
    const buffer = fs.readFileSync(filePath);
    // Avoid interpreting media or binary uploads as text. Credential files are
    // small text files, and this cap keeps a malformed upload from consuming
    // unbounded memory during a local validation run.
    if (buffer.includes(0)) return;
    content = buffer.toString("utf8");
  } catch {
    errors.push(relativePath(rootDir, filePath));
    return;
  }

  const file = relativePath(rootDir, filePath);
  if (PRIVATE_KEY_MARKER_RE.test(content)) {
    addFinding(findings, file, "private-key-marker");
  }

  try {
    const parsed: unknown = JSON.parse(content);
    if (isCredentialShapedJson(parsed)) {
      addFinding(findings, file, "credential-shaped-json");
    }
  } catch {
    // Invalid JSON is not itself a credential finding. A PEM marker in an
    // invalid JSON upload was already reported above.
  }
}

function scanDirectory(
  rootDir: string,
  directory: string,
  findings: CredentialFinding[],
  errors: string[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    errors.push(relativePath(rootDir, directory));
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORY_NAMES.has(entry.name)) {
        scanDirectory(rootDir, fullPath, findings, errors);
      }
    } else if (entry.isFile()) {
      inspectFile(rootDir, fullPath, findings, errors);
    }
  }
}

function findCandidateDirectories(
  rootDir: string,
  directory: string,
  candidates: string[],
  errors: string[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    errors.push(relativePath(rootDir, directory));
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (SKIP_DIRECTORY_NAMES.has(entry.name) || entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (CANDIDATE_DIRECTORY_RE.test(entry.name)) {
      candidates.push(fullPath);
      continue;
    }
    findCandidateDirectories(rootDir, fullPath, candidates, errors);
  }
}

export function scanWorkspaceForCredentials(
  rootDir: string = REPO_ROOT,
): CredentialScanResult {
  const resolvedRoot = path.resolve(rootDir);
  const findings: CredentialFinding[] = [];
  const errors: string[] = [];
  const candidates: string[] = [];

  if (!fs.existsSync(resolvedRoot)) {
    return {
      findings,
      errors: [".workspace-root"],
      scannedDirectories: [],
    };
  }

  findCandidateDirectories(resolvedRoot, resolvedRoot, candidates, errors);
  for (const directory of candidates) {
    scanDirectory(resolvedRoot, directory, findings, errors);
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind));
  errors.sort();
  return {
    findings,
    errors,
    scannedDirectories: candidates
      .map((directory) => relativePath(resolvedRoot, directory))
      .sort(),
  };
}

export function formatCredentialScanFailure(
  result: CredentialScanResult,
): string {
  const lines = [
    "Potential credentials were found in upload/scratch files.",
    ...result.findings.map(
      (finding) => `  - ${finding.file} (${finding.kind})`,
    ),
    ...(result.errors.length > 0
      ? [
          "",
          "The following candidate locations could not be read:",
          ...result.errors.map((file) => `  - ${file}`),
        ]
      : []),
    "",
    "Delete uploaded credential copies and store their values in Replit Secrets.",
    "For the mobile build's service account, use the existing ignored path",
    "artifacts/presentail/google-service-account.json only when the build tooling requires a file.",
    "This check does not print credential contents.",
  ];
  return lines.join("\n");
}

function main(): void {
  const result = scanWorkspaceForCredentials();
  if (result.findings.length === 0 && result.errors.length === 0) {
    console.log(
      `[credential-scan] PASS — scanned ${result.scannedDirectories.length} upload/scratch location(s); no credentials found.`,
    );
    return;
  }

  console.error(`[credential-scan] FAIL\n${formatCredentialScanFailure(result)}`);
  process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(url.fileURLToPath(import.meta.url))) {
  main();
}