import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatCredentialScanFailure,
  scanWorkspaceForCredentials,
} from "./checkUploadCredentials";

const temporaryRoots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "credential-scan-"));
  temporaryRoots.push(root);
  return root;
}

function writeFile(root: string, relativeFile: string, contents: string): void {
  const filePath = path.join(root, relativeFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("scanWorkspaceForCredentials", () => {
  it("detects Google service-account JSON without exposing its contents", () => {
    const root = makeRoot();
    writeFile(
      root,
      "attached_assets/uploaded.json",
      JSON.stringify({
        type: "service_account",
        project_id: "example-project",
        private_key_id: "example-key-id",
        private_key: "-----BEGIN PRIVATE KEY-----\nFAKE TEST VALUE\n-----END PRIVATE KEY-----",
        client_email: "build@example-project.iam.gserviceaccount.com",
      }),
    );

    const result = scanWorkspaceForCredentials(root);
    expect(result.findings).toEqual([
      { file: "attached_assets/uploaded.json", kind: "credential-shaped-json" },
      { file: "attached_assets/uploaded.json", kind: "private-key-marker" },
    ]);

    const message = formatCredentialScanFailure(result);
    expect(message).toContain("attached_assets/uploaded.json");
    expect(message).not.toContain("build@example-project");
    expect(message).not.toContain("FAKE TEST VALUE");
  });

  it("detects PEM markers without relying on filename extensions", () => {
    const root = makeRoot();
    writeFile(
      root,
      "uploads/build-signing",
      "-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----",
    );
    writeFile(
      root,
      "artifacts/release/scratch/credentials.txt",
      "-----BEGIN OPENSSH PRIVATE KEY-----\nFAKE\n-----END OPENSSH PRIVATE KEY-----",
    );

    const result = scanWorkspaceForCredentials(root);
    expect(result.findings).toEqual([
      { file: "artifacts/release/scratch/credentials.txt", kind: "private-key-marker" },
      { file: "uploads/build-signing", kind: "private-key-marker" },
    ]);
  });

  it("does not flag launch media or non-secret provenance evidence", () => {
    const root = makeRoot();
    writeFile(root, "attached_assets/hero.png", "not really an image");
    writeFile(
      root,
      "attached_assets/provenance.txt",
      'The launch notes mention a service account and the JSON field "private_key", but contain no credential.',
    );
    writeFile(
      root,
      "attached_assets/play-store-metadata.json",
      JSON.stringify({
        title: "Presentail",
        short_description: "Flowers and gifts delivered with care.",
      }),
    );
    writeFile(
      root,
      "artifacts/presentail/google-service-account.json",
      JSON.stringify({
        type: "service_account",
        private_key: "-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----",
        client_email: "build@example.com",
      }),
    );

    const result = scanWorkspaceForCredentials(root);
    expect(result.findings).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.scannedDirectories).toEqual(["attached_assets"]);
  });

  it("detects credential JSON saved as pasted text or arbitrary filenames", () => {
    const root = makeRoot();
    writeFile(
      root,
      "tmp/oauth.txt",
      JSON.stringify({
        installed: {
          client_id: "example-client",
          client_secret: "example-secret",
          auth_uri: "https://accounts.example.test/auth",
        },
      }),
    );
    writeFile(
      root,
      "scratch/cloud-export",
      JSON.stringify({
        accessKeyId: "example-access",
        secretAccessKey: "example-secret",
      }),
    );

    const result = scanWorkspaceForCredentials(root);
    expect(result.findings).toEqual([
      { file: "scratch/cloud-export", kind: "credential-shaped-json" },
      { file: "tmp/oauth.txt", kind: "credential-shaped-json" },
    ]);
  });
});
