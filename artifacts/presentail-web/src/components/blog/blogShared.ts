import { HUB_CITY } from "@/lib/hreflang";
import type { Language } from "@/contexts/LocaleContext";

/**
 * Compose a locale-aware storefront href from a market-relative path.
 * `/{lang}-{country}/{hubCity}{path}` — keeps the CTA / recommendation inside
 * the reader's language while pointing at the market's hub city (the blog
 * shell has no city context of its own).
 */
export function buildMarketHref(
  language: Language,
  path: string,
  country?: string,
): string {
  const c = (country ?? "lb") as keyof typeof HUB_CITY;
  const hub = HUB_CITY[c] ?? HUB_CITY.lb;
  const cc = HUB_CITY[c] ? c : "lb";
  return `/${language}-${cc}/${hub}${path}`;
}

/** Derive a stable anchor id from a section heading (Latin) or its index. */
export function sectionAnchorId(
  heading: string | undefined,
  explicitId: string | undefined,
  index: number,
): string {
  if (explicitId) return explicitId;
  const slug = (heading ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `section-${index}`;
}
