/**
 * Type declarations for the plain-ESM X-Robots-Tag helpers (`serve-robots.mjs`),
 * extracted from serve.mjs so they can be unit-tested without the HTTP server.
 */

/** A curated filter landing page exempt from the filter-param noindex guard. */
export interface CuratedFilterPage {
  path: string;
  params?: Record<string, string | number>;
}

/** Matches private / transactional route segments (cart, checkout, account, …). */
export const PRIVATE_ROUTE_RE: RegExp;
/** Marketing / click-ID query params that trigger noindex. */
export const UTM_PARAMS: Set<string>;
/** Faceted-navigation / utility query params that trigger "noindex, follow". */
export const FILTER_NOINDEX_PARAMS: Set<string>;
/** The only host that receives "index, follow". */
export const CANONICAL_PRODUCTION_HOST: string;

export function isPrivatePath(pathname: string): boolean;

/** True when the query string carries a UTM / click-ID / tracking-prefixed param. */
export function hasUtmParams(search: string | null | undefined): boolean;

/** True when the query string carries a filter / utility param. */
export function hasFilterParams(search: string | null | undefined): boolean;

/** True when pathname + search exactly match a curated filter landing page entry. */
export function isCuratedFilterPage(
  pathname: string,
  search: string,
  curatedFilterPages: CuratedFilterPage[] | null | undefined,
): boolean;

/**
 * X-Robots-Tag value for an HTML response, or null to omit the header on
 * non-canonical hosts.
 */
export function resolveXRobotsTag(
  host: string,
  pathname: string,
  search?: string,
  curatedFilterPages?: CuratedFilterPage[],
): string | null;
