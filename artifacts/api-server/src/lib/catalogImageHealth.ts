import { sendAlert } from "./alerts";
import { transformImage } from "./imageTransform";
import {
  IMAGE_FETCH_TIMEOUT_MS,
  ImageDeliveryError,
  parseOsImageUrl,
  readBoundedImageBody,
  safeImageIdentifier,
} from "./imageDelivery";
import { logger } from "./logger";
import { getOsProducts } from "./osProductsCache";
import { runDistributedJob } from "./distributedJob";

export type CatalogImageFindingKind =
  | "missing-reference"
  | "invalid-url"
  | "missing"
  | "upstream-error"
  | "non-image"
  | "empty"
  | "oversized"
  | "corrupt";

export type CatalogImageFinding = {
  productId: string;
  asset: string | null;
  kind: CatalogImageFindingKind;
  status?: number;
  detail: string;
};

export type CatalogImageHealthSummary = {
  ranAt: string;
  productsConsidered: number;
  uniqueImagesChecked: number;
  healthy: number;
  failing: number;
  findings: CatalogImageFinding[];
};

const STORE_KEYS = ["lebanon", "dubai", "cyprus"] as const;
const DEFAULT_SAMPLE_SIZE = 60;
const MAX_SAMPLE_SIZE = 500;
const CHECK_CONCURRENCY = 4;

function catalogProducts() {
  const byId = new Map<string, NonNullable<ReturnType<typeof getOsProducts>>[number]>();
  for (const storeKey of STORE_KEYS) {
    for (const product of getOsProducts(storeKey) ?? []) byId.set(product.id, product);
  }
  return [...byId.values()];
}

async function checkOne(
  productId: string,
  rawUrl: string,
  signal?: AbortSignal,
): Promise<CatalogImageFinding | null> {
  let target: URL;
  try {
    target = parseOsImageUrl(rawUrl);
  } catch {
    return {
      productId,
      asset: null,
      kind: "invalid-url",
      detail: "Image URL is outside the trusted OS storage policy",
    };
  }

  try {
    const response = await fetch(target.toString(), {
      headers: process.env.PRESENTAIL_OS_API_KEY
        ? { "x-api-key": process.env.PRESENTAIL_OS_API_KEY }
        : {},
      redirect: "manual",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS)])
        : AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (response.status === 404 || response.status === 410) {
      return {
        productId,
        asset: safeImageIdentifier(target),
        kind: "missing",
        status: response.status,
        detail: "Source object does not exist",
      };
    }
    if (!response.ok || (response.status >= 300 && response.status < 400)) {
      return {
        productId,
        asset: safeImageIdentifier(target),
        kind: "upstream-error",
        status: response.status,
        detail: "Source object was temporarily unavailable",
      };
    }
    const body = await readBoundedImageBody(response);
    const transformed = await transformImage(body, { width: 800, format: "webp", quality: 82 });
    if (transformed.data.byteLength === 0) {
      return {
        productId,
        asset: safeImageIdentifier(target),
        kind: "corrupt",
        detail: "Proxy-equivalent image transform returned no data",
      };
    }
    return null;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (error instanceof ImageDeliveryError) {
      const kind: CatalogImageFindingKind =
        error.code === "non-image" ? "non-image"
          : error.code === "empty" ? "empty"
            : error.code === "oversized" ? "oversized"
              : "upstream-error";
      return {
        productId,
        asset: safeImageIdentifier(target),
        kind,
        status: error.upstreamStatus,
        detail: error.message,
      };
    }
    return {
      productId,
      asset: safeImageIdentifier(target),
      kind: "corrupt",
      detail: error instanceof Error ? error.message.slice(0, 160) : "Image could not be decoded",
    };
  }
}

export async function runCatalogImageHealthCheck(
  requestedLimit = DEFAULT_SAMPLE_SIZE,
  signal?: AbortSignal,
): Promise<CatalogImageHealthSummary> {
  const products = catalogProducts();
  const limit = Math.min(Math.max(1, requestedLimit), MAX_SAMPLE_SIZE);
  const findings: CatalogImageFinding[] = [];
  const candidates: Array<{ productId: string; url: string }> = [];
  const seen = new Set<string>();

  for (const product of products) {
    signal?.throwIfAborted();
    const url = product.images?.[0]?.url?.trim();
    if (!url) {
      findings.push({
        productId: product.id,
        asset: null,
        kind: "missing-reference",
        detail: "Product has no primary image reference",
      });
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push({ productId: product.id, url });
    if (candidates.length >= limit) break;
  }

  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      signal?.throwIfAborted();
      const candidate = candidates[cursor++];
      const finding = await checkOne(candidate.productId, candidate.url, signal);
      if (finding) findings.push(finding);
    }
  }));

  return {
    ranAt: new Date().toISOString(),
    productsConsidered: products.length,
    uniqueImagesChecked: candidates.length,
    healthy: candidates.length - findings.filter((item) => item.kind !== "missing-reference").length,
    failing: findings.length,
    findings,
  };
}

let monitorTimer: NodeJS.Timeout | null = null;
let lastAlertFingerprint = "";
let lastAlertAt = 0;

export function startCatalogImageHealthMonitor(): void {
  if (monitorTimer || process.env.NODE_ENV === "test") return;
  const enabled = !["0", "false", "off", "no"].includes(
    (process.env.IMAGE_HEALTH_MONITOR_ENABLED ?? "1").toLowerCase(),
  );
  if (!enabled) return;

  const run = async () => {
    try {
      await runDistributedJob({
        jobName: "catalog-image-health",
        intervalMs: 24 * 60 * 60 * 1000,
        leaseMs: 30 * 60_000,
        task: async (context) => {
          const summary = await runCatalogImageHealthCheck(
            DEFAULT_SAMPLE_SIZE,
            context.signal,
          );
          context.signal.throwIfAborted();
          logger.info(
            {
              checked: summary.uniqueImagesChecked,
              healthy: summary.healthy,
              failing: summary.failing,
            },
            "catalog image health check completed",
          );
          if (summary.failing === 0) {
            lastAlertFingerprint = "";
            return;
          }
          const fingerprint = summary.findings
            .map((item) => `${item.productId}:${item.kind}:${item.asset ?? ""}`)
            .sort()
            .join("|");
          if (
            fingerprint === lastAlertFingerprint &&
            Date.now() - lastAlertAt < 24 * 60 * 60 * 1000
          ) {
            return;
          }
          lastAlertFingerprint = fingerprint;
          lastAlertAt = Date.now();
          await sendAlert({
            title: "Catalog image health check found broken assets",
            body: `${summary.failing} sampled catalog image references need attention.`,
            severity: "warn",
            fields: summary.findings.slice(0, 8).map((item) => ({
              title: item.productId,
              value: `${item.kind}: ${item.asset ?? "no image reference"}`,
            })),
            source: "catalogImageHealth",
          });
        },
      });
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        "catalog image health check failed",
      );
    }
  };

  const initialTimer = setTimeout(() => void run(), 5 * 60 * 1000);
  initialTimer.unref?.();
  monitorTimer = setInterval(() => void run(), 24 * 60 * 60 * 1000);
  monitorTimer.unref?.();
}