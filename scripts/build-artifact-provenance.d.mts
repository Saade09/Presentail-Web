export function artifactDefaults(name: string): string[];

export function buildCacheKey(options: {
  name: string;
  sourceHash: string;
  environment?: Record<string, string | undefined>;
  buildConfiguration?: unknown;
}): string;

export function getArtifactSourceHash(name: string): Promise<string>;
