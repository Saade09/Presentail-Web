import type { CatalogImageRef } from "./queries";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "/");

export function catalogAssetUrl(ref: CatalogImageRef | undefined): string | null {
  if (!ref) return null;
  if (typeof ref === "object" && "uri" in ref && typeof ref.uri === "string" && ref.uri.length > 0) {
    return ref.uri;
  }
  if (typeof ref === "object" && "asset" in ref && typeof ref.asset === "string" && ref.asset.length > 0) {
    const path = ref.asset.replace(/^\/+/, "");
    return `${BASE}catalog/${path}`;
  }
  return null;
}
