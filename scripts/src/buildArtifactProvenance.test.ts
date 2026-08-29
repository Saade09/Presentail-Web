import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  artifactDefaults,
  buildCacheKey,
  getArtifactSourceHash,
} from "../build-artifact-provenance.mjs";

const WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ARTIFACT_NAMES = ["api", "web", "mobile"] as const;
type ArtifactName = (typeof ARTIFACT_NAMES)[number];

const TEST_ENVIRONMENT = {
  NODE_ENV: "production",
  BASE_PATH: "/",
  STATIC_ASSET_BASE_PATH: "/app-static/",
  STATIC_ASSET_BASE_URL: "https://static.example.test/app-static/",
  REPLIT_INTERNAL_APP_DOMAIN: "internal.example.test",
  REPLIT_DEV_DOMAIN: "dev.example.test",
  EXPO_PUBLIC_DOMAIN: "internal.example.test",
  REPL_ID: "repl-a",
  EXPO_PUBLIC_REPL_ID: "repl-a",
  VITE_GTAG_GA4_ID: "ga4-a",
};

const BUILD_CONFIGURATIONS: Record<ArtifactName, string> = {
  api: "api-esbuild-runtime",
  web: "vite-production",
  mobile: "expo-static-production",
};

async function sourceSnapshot() {
  const hashes = Object.fromEntries(
    await Promise.all(
      ARTIFACT_NAMES.map(async (name) => [
        name,
        await getArtifactSourceHash(name),
      ]),
    ),
  ) as Record<ArtifactName, string>;

  const keys = Object.fromEntries(
    ARTIFACT_NAMES.map((name) => [
      name,
      buildCacheKey({
        name,
        sourceHash: hashes[name],
        environment: TEST_ENVIRONMENT,
        buildConfiguration: BUILD_CONFIGURATIONS[name],
      }),
    ]),
  ) as Record<ArtifactName, string>;

  return { hashes, keys };
}

function cacheKeysForEnvironment(environment: Record<string, string>) {
  return Object.fromEntries(
    ARTIFACT_NAMES.map((name) => [
      name,
      buildCacheKey({
        name,
        sourceHash: `${name}-source`,
        environment,
        buildConfiguration: BUILD_CONFIGURATIONS[name],
      }),
    ]),
  ) as Record<ArtifactName, string>;
}

async function withMutatedSource(
  relativePath: string,
  mutate: (contents: string) => string,
  callback: () => Promise<void>,
) {
  const filePath = path.join(WORKSPACE_ROOT, relativePath);
  const original = await readFile(filePath, "utf8");
  try {
    await writeFile(filePath, mutate(original), "utf8");
    await callback();
  } finally {
    await writeFile(filePath, original, "utf8");
  }
}

function expectOnlyArtifactsToChange(
  before: Record<ArtifactName, string>,
  after: Record<ArtifactName, string>,
  changed: readonly ArtifactName[],
) {
  for (const name of ARTIFACT_NAMES) {
    if (changed.includes(name)) {
      expect(after[name], `${name} should be invalidated`).not.toBe(
        before[name],
      );
    } else {
      expect(after[name], `${name} should not be invalidated`).toBe(
        before[name],
      );
    }
  }
}

describe("publish artifact provenance", () => {
  it("tracks every web build script, including future generators, as a web input", async () => {
    const webPackage = JSON.parse(
      await readFile(
        path.join(WORKSPACE_ROOT, "artifacts/presentail-web/package.json"),
        "utf8",
      ),
    ) as { scripts?: { build?: string } };
    const buildCommand = webPackage.scripts?.build ?? "";
    const scriptPaths = [
      ...buildCommand.matchAll(
        /\bnode\s+((?:\.\.\/)*scripts\/[\w.-]+\.mjs|[\w.-]+\.mjs)/g,
      ),
    ].map((match) => {
      const script = match[1];
      return path.posix.normalize(
        script.startsWith("../")
          ? `artifacts/presentail-web/${script}`
          : `artifacts/presentail-web/${script}`,
      );
    });

    expect(scriptPaths.length).toBeGreaterThan(0);
    const webInputs = artifactDefaults("web");
    for (const scriptPath of scriptPaths) {
      expect(
        webInputs,
        `${scriptPath} must be included in web provenance inputs`,
      ).toContain(scriptPath);
    }
  });

  it("invalidates only web when a web-only build generator changes", async () => {
    const before = await sourceSnapshot();

    await withMutatedSource(
      "artifacts/presentail-web/scripts/generate-blog-index.mjs",
      (contents) => `${contents}\n// provenance mutation probe\n`,
      async () => {
        const after = await sourceSnapshot();
        expectOnlyArtifactsToChange(before.keys, after.keys, ["web"]);
        expect(after.hashes.web).not.toBe(before.hashes.web);
        expect(after.hashes.api).toBe(before.hashes.api);
        expect(after.hashes.mobile).toBe(before.hashes.mobile);
      },
    );
  }, 30_000);

  it("invalidates only mobile when resolved deployment identity changes", () => {
    const before = cacheKeysForEnvironment(TEST_ENVIRONMENT);

    for (const [environmentKey, changedValue] of [
      ["REPLIT_INTERNAL_APP_DOMAIN", "internal-b.example.test"],
      ["REPLIT_DEV_DOMAIN", "dev-b.example.test"],
      ["EXPO_PUBLIC_DOMAIN", "public-b.example.test"],
      ["REPL_ID", "repl-b"],
      ["EXPO_PUBLIC_REPL_ID", "repl-b"],
    ]) {
      const environment = {
        ...TEST_ENVIRONMENT,
        [environmentKey]: changedValue,
      };
      const after = cacheKeysForEnvironment(environment);
      expectOnlyArtifactsToChange(before, after, ["mobile"]);
    }
  });

  it("invalidates exactly the artifacts that consume each shared library", async () => {
    const probes = [
      {
        file: "lib/api-client-react/src/index.ts",
        consumers: ["web", "mobile"] as const,
      },
      {
        file: "lib/integrations-openai-ai-server/src/index.ts",
        consumers: ["api"] as const,
      },
      {
        file: "lib/catalog-data/src/index.ts",
        consumers: ["api", "web", "mobile"] as const,
      },
    ];

    for (const probe of probes) {
      const before = await sourceSnapshot();
      await withMutatedSource(
        probe.file,
        (contents) => `${contents}\n// provenance mutation probe\n`,
        async () => {
          const after = await sourceSnapshot();
          expectOnlyArtifactsToChange(before.keys, after.keys, probe.consumers);
        },
      );
    }
  }, 45_000);
});
