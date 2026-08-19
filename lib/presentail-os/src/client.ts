import type {
  OSLocationsResponse,
  OSCountry,
  OSCity,
  OSTimeSlot,
  OSProduct,
  OSProductBrand,
  OSProductCategory,
  OSProductsResponse,
  OSCategoriesResponse,
  OSCatalogAttributeBrandsResponse,
  OSOccasionsResponse,
  OSOccasionStatsResponse,
  OSCreateOrderPayload,
  OSCreateOrderResponse,
} from "./types";

const DEFAULT_BASE_URL = "https://os.presentail.com";
const DEFAULT_WORKSPACE = "presentail";
const FETCH_TIMEOUT_MS = 25_000;

export type PresentailOsConfig = {
  /** Base URL of the Presentail OS instance. Defaults to https://os.presentail.com. */
  baseUrl?: string;
  /** API key for the public locations endpoint. Required. */
  apiKey: string;
  /** Workspace slug to pass to the public endpoint. Defaults to "presentail". */
  workspace?: string;
};

// ── Legacy /api/delivery-locations normalisation ────────────────────────────
//
// The legacy endpoint predates the "-ext" endpoint and is the only one that
// currently returns some countries (e.g. Cyprus) — the ext endpoint has not
// been rolled out for every country yet. Its wire format uses snake_case
// field names and a per-day-of-week slot shape rather than the ext
// endpoint's camelCase/flat-timeSlots shape, so it must be normalised into
// the same OSCountry/OSCity shape before it can be merged with (or used in
// place of) the ext response.

type RawLegacyTimeSlot = {
  id?: string | number | null;
  day_of_week?: number;
  label?: string;
  start_time?: string;
  end_time?: string;
  fee_override?: number | null;
  cutoff_time?: string | null;
  same_day?: boolean | null;
  next_day?: boolean | null;
  enabled?: boolean | null;
  service_type?: string | null;
};

type RawLegacyCity = {
  id: string | number;
  name: string;
  slug?: string;
  is_active?: boolean;
  isActive?: boolean;
  delivery_fee?: number;
  free_delivery_enabled?: boolean;
  free_delivery_threshold?: number;
  express_delivery_enabled?: boolean;
  express_delivery_fee?: number;
  express_delivery_cutoff_time?: string | null;
  delivery_slots?: RawLegacyTimeSlot[];
};

type RawLegacyCountry = {
  id?: string;
  code: string;
  name: string;
  isActive?: boolean;
  is_active?: boolean;
  flag_emoji?: string;
  currency?: string;
  cities: RawLegacyCity[];
};

type RawLegacyLocationsResponse = { countries?: RawLegacyCountry[] };

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Parse "HH:MM" or "HH:MM:SS" → hour integer (0–23). Returns undefined if invalid. */
function parseLegacyHour(timeStr?: string | null): number | undefined {
  if (!timeStr) return undefined;
  const h = parseInt(timeStr.split(":")[0] ?? "", 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : undefined;
}

/** Parse "HH:MM" or "HH:MM:SS" → minute integer (0–59). */
function parseLegacyMinute(timeStr?: string | null): number | undefined {
  if (!timeStr) return undefined;
  const minute = parseInt(timeStr.split(":")[1] ?? "", 10);
  return Number.isFinite(minute) && minute >= 0 && minute <= 59
    ? minute
    : undefined;
}

function mapLegacySlots(raw: RawLegacyTimeSlot[] | undefined): {
  timeSlots: OSTimeSlot[];
  slotsByDay?: Record<string, OSTimeSlot[]>;
} {
  if (!Array.isArray(raw) || raw.length === 0) return { timeSlots: [] };

  const slotsByDay: Record<string, OSTimeSlot[]> = {};
  for (const s of raw) {
    const dayName = WEEKDAY_NAMES[s.day_of_week ?? -1];
    if (!dayName) continue;
    const slotId = s.id != null ? String(s.id) : undefined;
    const slot: OSTimeSlot = {
      label: s.label ?? "",
      slotId,
      startHour: parseLegacyHour(s.start_time),
      endHour: parseLegacyHour(s.end_time),
      cutoffHour: parseLegacyHour(s.cutoff_time) ?? parseLegacyHour(s.start_time) ?? 0,
      cutoffMinute:
        parseLegacyMinute(s.cutoff_time) ??
        parseLegacyMinute(s.start_time) ??
        0,
      // Normalise fee_override: treat null as "no override" (undefined) and coerce strings to number.
      extraFee: s.fee_override != null ? Number(s.fee_override) : undefined,
      sameDayEnabled: s.same_day ?? undefined,
      nextDayEnabled: s.next_day ?? undefined,
      enabled: s.enabled ?? undefined,
      serviceType: s.service_type ?? undefined,
    };
    (slotsByDay[dayName] ??= []).push(slot);
  }

  // Flat fallback list: deduplicate by slotId when IDs are present so that two
  // slots with the same label but different IDs (e.g. "Night" same-day vs
  // next-day) are both preserved. Fall back to label-based dedup only when no
  // slot in the list has an ID (legacy OS data without IDs).
  const hasIds = Object.values(slotsByDay).some((slots) =>
    slots.some((slot) => slot.slotId !== undefined),
  );
  const seenKeys = new Set<string>();
  const timeSlots: OSTimeSlot[] = [];
  for (const daySlots of Object.values(slotsByDay)) {
    for (const slot of daySlots) {
      const key = hasIds ? (slot.slotId ?? slot.label) : slot.label;
      if (!slot.label || seenKeys.has(key)) continue;
      seenKeys.add(key);
      timeSlots.push(slot);
    }
  }

  return { timeSlots, slotsByDay };
}

function normaliseLegacyCity(raw: RawLegacyCity): OSCity {
  const { timeSlots, slotsByDay } = mapLegacySlots(raw.delivery_slots);
  return {
    // OSCity.id is nominally numeric, but the legacy endpoint uses string
    // slugs (e.g. "nicosia") as both id and slug. Downstream code always
    // prefers `slug` over `id` (falling back to String(id)), so a numeric
    // placeholder here is safe as long as slug is always populated.
    id: typeof raw.id === "number" ? raw.id : 0,
    slug: raw.slug ?? String(raw.id),
    name: raw.name,
    // The legacy endpoint sends both `isActive` and `is_active` on every
    // city; prefer the camelCase field but fall back to snake_case for
    // robustness against older OS deployments that only send one.
    isActive: raw.isActive ?? raw.is_active,
    deliveryFee: raw.delivery_fee,
    expressAvailable: raw.express_delivery_enabled,
    sameDayCutoffHour: parseLegacyHour(raw.express_delivery_cutoff_time),
    sameDayCutoffMinute: parseLegacyMinute(raw.express_delivery_cutoff_time),
    timeSlots,
    slotsByDay,
    freeDeliveryThreshold: raw.free_delivery_threshold,
    freeDeliveryEnabled: raw.free_delivery_enabled,
  };
}

function normaliseLegacyCountry(raw: RawLegacyCountry): OSCountry {
  return {
    id: raw.id ?? raw.code,
    name: raw.name,
    code: raw.code,
    flag: raw.flag_emoji,
    currency: raw.currency,
    isActive: raw.isActive ?? raw.is_active ?? true,
    cities: (raw.cities ?? []).map(normaliseLegacyCity),
  };
}

function slotsMatch(a: OSTimeSlot, b: OSTimeSlot): boolean {
  if (a.slotId && b.slotId) return a.slotId === b.slotId;
  return a.label === b.label;
}

function enrichSlot(primary: OSTimeSlot, legacySlots: OSTimeSlot[]): OSTimeSlot {
  const legacy = legacySlots.find((slot) => slotsMatch(primary, slot));
  return legacy ? { ...legacy, ...primary } : primary;
}

function slotFeedsConflict(primary: OSTimeSlot, legacy: OSTimeSlot): boolean {
  const fields: Array<keyof OSTimeSlot> = [
    "cutoffHour",
    "cutoffMinute",
    "sameDayEnabled",
    "nextDayEnabled",
    "enabled",
  ];
  return fields.some(
    (field) =>
      primary[field] !== undefined &&
      legacy[field] !== undefined &&
      primary[field] !== legacy[field],
  );
}

/**
 * The ext endpoint owns which countries/cities/slots currently exist, while
 * the legacy endpoint still carries minute precision and per-day flags that
 * some ext deployments omit. Enrich only matching ext entities; never revive
 * a city or slot that the primary feed removed.
 */
function enrichPrimaryCountry(
  primary: OSCountry,
  legacy: OSCountry | undefined,
): OSCountry {
  if (!legacy) return primary;
  return {
    ...primary,
    cities: (primary.cities ?? []).map((city) => {
      const primarySlug = String(city.slug ?? "").toLowerCase();
      const primaryName = String(city.name ?? "").toLowerCase();
      const legacyCity = (legacy.cities ?? []).find(
        (candidate) =>
          (primarySlug.length > 0 &&
            String(candidate.slug ?? "").toLowerCase() === primarySlug) ||
          (primaryName.length > 0 &&
            String(candidate.name ?? "").toLowerCase() === primaryName),
      );
      if (!legacyCity) return city;

      const primarySlots = city.timeSlots ?? [];
      const legacySlots = legacyCity.timeSlots ?? [];
      const timeSlots = primarySlots.map((slot) =>
        enrichSlot(slot, legacySlots),
      );
      const slotsByDay = city.slotsByDay
        ? Object.fromEntries(
            Object.entries(city.slotsByDay).map(([day, slots]) => [
              day,
              slots.map((slot) =>
                enrichSlot(slot, legacyCity.slotsByDay?.[day] ?? legacySlots),
              ),
            ]),
          )
        : primarySlots.length > 0 && legacyCity.slotsByDay
          ? Object.fromEntries(
              Object.entries(legacyCity.slotsByDay)
                .map(([day, slots]) => [
                  day,
                  slots
                    .filter((legacySlot) =>
                      primarySlots.some((slot) =>
                        slotsMatch(slot, legacySlot),
                      ),
                    )
                    .map((slot) => enrichSlot(slot, primarySlots)),
                ])
                .filter(([, slots]) => (slots as OSTimeSlot[]).length > 0),
            )
          : undefined;

      const cityCutoffConflict =
        city.sameDayCutoffHour !== undefined &&
        legacyCity.sameDayCutoffHour !== undefined &&
        (city.sameDayCutoffHour !== legacyCity.sameDayCutoffHour ||
          (city.sameDayCutoffMinute !== undefined &&
            legacyCity.sameDayCutoffMinute !== undefined &&
            city.sameDayCutoffMinute !== legacyCity.sameDayCutoffMinute));
      const expressConflict =
        city.expressAvailable !== undefined &&
        legacyCity.expressAvailable !== undefined &&
        city.expressAvailable !== legacyCity.expressAvailable;
      const slotConflict = primarySlots.some((slot) => {
        const legacySlot = legacySlots.find((candidate) =>
          slotsMatch(slot, candidate),
        );
        return legacySlot ? slotFeedsConflict(slot, legacySlot) : false;
      });

      return {
        ...legacyCity,
        ...city,
        sameDayCutoffMinute:
          city.sameDayCutoffMinute ?? legacyCity.sameDayCutoffMinute,
        timeSlots,
        ...(slotsByDay ? { slotsByDay } : {}),
        operationsConfigConsistent:
          !cityCutoffConflict && !expressConflict && !slotConflict,
      };
    }),
  };
}

/**
 * Fetch the full locations + delivery config from Presentail OS.
 *
 * The API key is sent in the `x-api-key` header. It is also included as the
 * `apiKey` query parameter because the public endpoint currently requires it
 * there; the header form is preferred to avoid the key appearing in server logs.
 *
 * Throws with a descriptive message if the API key is absent or the
 * request fails. The caller is responsible for graceful fallback.
 */
export async function fetchOsLocations(
  config: PresentailOsConfig,
): Promise<OSLocationsResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error(
      "PRESENTAIL_OS_API_KEY is required but was not provided. " +
        "Set this environment variable to enable live delivery configuration from Presentail OS.",
    );
  }

  async function tryFetch(path: string): Promise<Response> {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("workspace", workspace);
    url.searchParams.set("apiKey", apiKey);
    return fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "PresentailApp/1.0",
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }

  /**
   * Best-effort fetch of the legacy endpoint, normalised into the canonical
   * OSCountry shape. Returns an empty list on any failure (network error,
   * non-ok status, or unexpected body shape) — callers treat this as "no
   * supplemental data available" rather than a hard failure, since the
   * legacy endpoint is only ever used to fill gaps in the primary response.
   */
  async function fetchLegacyCountries(): Promise<OSCountry[]> {
    try {
      const res = await tryFetch("/api/delivery-locations");
      if (!res.ok) return [];
      const body = (await res.json()) as RawLegacyLocationsResponse;
      if (!Array.isArray(body.countries)) return [];
      return body.countries.map(normaliseLegacyCountry);
    } catch {
      return [];
    }
  }

  // Primary: /api/delivery-locations-ext (enriched endpoint with slug, expressFeeTotal,
  // expressSurcharge, and freeDeliveryThreshold fields).
  //
  // The ext endpoint is not yet deployed for every country (e.g. Cyprus is
  // only available from the legacy /api/delivery-locations endpoint). Rather
  // than an all-or-nothing fallback, fetch both endpoints and merge in any
  // country present in the legacy response but absent from the ext response
  // — this lets each country flow through the same live isActive sync path
  // regardless of which endpoint currently serves it, and requires no
  // per-country special-casing here or in the cache transform layer.
  const primaryRes = await tryFetch("/api/delivery-locations-ext");
  if (primaryRes.ok) {
    const primaryBody = (await primaryRes.json()) as OSLocationsResponse;
    const legacyCountries = await fetchLegacyCountries();
    const primaryCountries = (primaryBody.countries ?? []).map((country) =>
      enrichPrimaryCountry(
        country,
        legacyCountries.find(
          (candidate) =>
            String(candidate.code ?? "").toLowerCase() ===
            String(country.code ?? "").toLowerCase(),
        ),
      ),
    );
    const primaryCodes = new Set(
      primaryCountries.map((c) => String(c.code ?? "").toLowerCase()),
    );
    const supplemental = legacyCountries.filter(
      (c) => !primaryCodes.has(String(c.code ?? "").toLowerCase()),
    );
    return {
      countries: [...primaryCountries, ...supplemental],
    };
  }

  // Primary failed entirely — use the legacy endpoint as the full response.
  const legacyRes = await tryFetch("/api/delivery-locations");
  if (legacyRes.ok) {
    const legacyBody = (await legacyRes.json()) as RawLegacyLocationsResponse;
    return { countries: (legacyBody.countries ?? []).map(normaliseLegacyCountry) };
  }

  // Both endpoints failed — try the oldest legacy path as a last resort.
  const oldLegacyRes = await tryFetch("/api/public/locations");
  if (!oldLegacyRes.ok) {
    throw new Error(
      `Presentail OS locations API returned HTTP ${oldLegacyRes.status} (primary ext: ${primaryRes.status}, legacy: ${legacyRes.status})`,
    );
  }

  return oldLegacyRes.json() as Promise<OSLocationsResponse>;
}

/**
 * Fetch the full product catalog from Presentail OS.
 *
 * Tries `/api/products` first (primary endpoint). Falls back to
 * `/api/stickers` for legacy OS deployments that use the older path.
 *
 * Throws if both endpoints fail or the API key is absent.
 * The caller is responsible for graceful fallback (e.g. WooCommerce).
 *
 * @param countryCode  Optional ISO 3166-1 alpha-2 to filter by country (uppercase).
 * @param cityId       Optional city id to filter by city.
 * @param lang         BCP-47 language tag (default "en").
 */

/**
 * Maximum number of pages to fetch in a single `fetchOsProducts` call.
 * At 100 products per page this covers up to 5 000 products — well above
 * any realistic catalog size. Acts as a circuit-breaker against an
 * unexpectedly large response or a buggy `totalPages` field.
 */
const MAX_PAGES = 50;
const DEFAULT_PAGE_SIZE = 100;

/**
 * Raw product shape as returned by the OS API wire format.
 * The OS API returns a numeric `id` (database PK). A `slug` field may be
 * present on newer OS deployments; when absent, the slug is derived from the
 * product name so URLs remain human-readable (e.g. "velvet-rose-bouquet").
 * After normalisation, `OSProduct.id` is always a URL-safe string slug.
 */
type RawOSProduct = Omit<OSProduct, "id" | "hasInputField"> & {
  id: number | string;
  slug?: string;
  /** OS API returns category data under this key (not `categories`). */
  catalog_categories?: OSProductCategory[];
  /** OS API returns brand data under this key (not `brands`). */
  catalog_brands?: OSProductBrand[];
  /** OS API sends snake_case; some versions send camelCase — handle both. */
  has_input_field?: boolean;
  hasInputField?: boolean;
  has_letter_field?: boolean;
  hasLetterField?: boolean;
};

type RawOSProductsResponse = Omit<OSProductsResponse, "products"> & {
  products: RawOSProduct[];
};

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Intermediate type that retains the raw numeric id for collision resolution. */
type NormalisedProduct = OSProduct & { _rawNumericId: number | string };

function normaliseProduct(raw: RawOSProduct): NormalisedProduct {
  // Prefer an explicit slug from the API; fall back to a name-derived slug so
  // product URLs are human-readable rather than numeric IDs.
  const id = raw.slug ?? nameToSlug(raw.name);
  // The OS API returns category data under `catalog_categories`, not `categories`.
  // Prefer `catalog_categories` when present so filtering by category works correctly.
  const categories = raw.catalog_categories ?? raw.categories ?? [];
  // The OS API returns brand data under `catalog_brands`, not `brands`.
  // Prefer `catalog_brands` when present so filtering by brand slug works correctly.
  const brands = raw.catalog_brands ?? raw.brands ?? [];
  return {
    ...raw,
    categories,
    brands,
    id,
    _rawNumericId: raw.id,
    hasInputField: raw.has_input_field ?? raw.hasInputField ?? false,
    hasLetterField: raw.has_letter_field ?? raw.hasLetterField ?? false,
  };
}

/**
 * Resolve slug collisions (products with the same name) by appending the
 * numeric OS id so every product has a unique URL segment.
 * E.g. two "Happy Birthday Balloon" products become
 *   "happy-birthday-balloon--650" and "happy-birthday-balloon--651".
 */
function deduplicateSlugs(products: NormalisedProduct[]): OSProduct[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
  }
  return products.map((p) => {
    const { _rawNumericId, ...rest } = p as NormalisedProduct & Record<string, unknown>;
    // Always preserve the raw OS database PK as osNumericId so order submission
    // can send the correct identifier (the OS orders endpoint looks up products
    // by their DB PK, not by slug).
    const withNumericId: OSProduct = { ...(rest as OSProduct), osNumericId: _rawNumericId };
    if ((counts.get(p.id) ?? 0) > 1) {
      return { ...withNumericId, id: `${p.id}--${_rawNumericId}` };
    }
    return withNumericId;
  });
}

export async function fetchOsProducts(
  config: PresentailOsConfig,
  opts: { countryCode?: string; cityId?: string; lang?: string } = {},
): Promise<OSProductsResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;
  const { lang = "en" } = opts;

  if (!apiKey) {
    throw new Error("PRESENTAIL_OS_API_KEY is required for fetchOsProducts.");
  }

  async function fetchPage(path: string, page: number): Promise<Response> {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("workspace", workspace);
    url.searchParams.set("apiKey", apiKey);
    // OS API requires snake_case query params: country_code and city_slug.
    // Internal city IDs use a prefixed format (e.g. "ae-dubai"); strip the
    // two-letter country prefix to get the OS city slug ("dubai").
    // Confirmed: OS /api/products accepts country_code=LB and city_slug=dubai.
    if (opts.countryCode) url.searchParams.set("country_code", opts.countryCode);
    if (opts.cityId) url.searchParams.set("city_slug", opts.cityId.replace(/^[a-z]{2}-/, ""));
    if (lang !== "en") url.searchParams.set("lang", lang);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(DEFAULT_PAGE_SIZE));
    return fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "PresentailApp/1.0",
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }

  async function fetchAllPages(path: string): Promise<OSProductsResponse | null> {
    const firstRes = await fetchPage(path, 1);
    if (!firstRes.ok) return null;
    const firstBody = (await firstRes.json()) as RawOSProductsResponse;
    if (!Array.isArray(firstBody.products)) return null;

    const totalPages = Math.min(firstBody.totalPages ?? 1, MAX_PAGES);
    const normalisedFirst = firstBody.products.map(normaliseProduct);
    if (totalPages <= 1) {
      return { ...firstBody, products: deduplicateSlugs(normalisedFirst) };
    }

    // Fetch remaining pages in parallel.
    const remaining = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(path, i + 2)),
    );
    const allProducts: NormalisedProduct[] = [...normalisedFirst];
    for (const res of remaining) {
      if (!res.ok) break; // stop collecting on any error; use what we have
      const body = (await res.json()) as RawOSProductsResponse;
      if (Array.isArray(body.products)) allProducts.push(...body.products.map(normaliseProduct));
    }
    return { ...firstBody, products: deduplicateSlugs(allProducts) };
  }

  // Primary endpoint: /api/products
  const primary = await fetchAllPages("/api/products");
  if (primary) return primary;

  // Fallback: /api/stickers (legacy OS path)
  const legacyRes = await fetchPage("/api/stickers", 1);
  if (!legacyRes.ok) {
    throw new Error(`Presentail OS products API returned HTTP ${legacyRes.status}`);
  }
  const rawBody = (await legacyRes.json()) as RawOSProductsResponse;
  if (!Array.isArray(rawBody.products)) {
    throw new Error("Presentail OS products API: unexpected response shape");
  }
  return { ...rawBody, products: rawBody.products.map(normaliseProduct) };
}

/**
 * Fetch product categories from Presentail OS.
 * Throws on failure — caller handles graceful fallback.
 */
export async function fetchOsCategories(
  config: PresentailOsConfig,
): Promise<OSCategoriesResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error("PRESENTAIL_OS_API_KEY is required for fetchOsCategories.");
  }

  const url = new URL(`${baseUrl}/api/categories`);
  url.searchParams.set("workspace", workspace);
  url.searchParams.set("apiKey", apiKey);
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      "x-api-key": apiKey,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Presentail OS categories API returned HTTP ${res.status}`);
  }
  const raw = (await res.json()) as {
    categories?: Array<{
      id: string | number;
      slug: string;
      name: string;
      is_featured?: boolean;
      image_url?: string | null;
      image_public_url?: string | null;
      description?: string | null;
      // Some OS deployments already send camelCase — handle both.
      image?: string | null;
      imagePublicUrl?: string | null;
    }>;
  };
  const toAbs = (u: string | null | undefined) =>
    u ? (u.startsWith("http") ? u : `${baseUrl}${u}`) : null;
  const categories: OSCategoriesResponse["categories"] = (
    raw.categories ?? []
  ).map((item) => ({
    id: String(item.id),
    slug: item.slug,
    name: item.name,
    is_featured: item.is_featured,
    description: item.description ?? null,
    // Normalise snake_case → camelCase so the proxy and buildOsCategories
    // can reliably read image fields regardless of which OS version is deployed.
    image: toAbs(item.image_url) ?? item.image ?? null,
    imagePublicUrl: toAbs(item.image_public_url) ?? item.imagePublicUrl ?? null,
  }));
  return { categories };
}

/**
 * Fetch all brands from the Presentail OS public catalog-attributes endpoint.
 * Returns brands with canonical slugs, names, images, and sort_order regardless
 * of whether any products are currently linked to them.
 * Throws on failure — caller handles graceful fallback.
 */
export async function fetchOsCatalogAttributesBrands(
  config: PresentailOsConfig,
): Promise<OSCatalogAttributeBrandsResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error("PRESENTAIL_OS_API_KEY is required for fetchOsCatalogAttributesBrands.");
  }

  const url = new URL(`${baseUrl}/api/catalog-attributes/brands`);
  url.searchParams.set("workspace", workspace);
  url.searchParams.set("apiKey", apiKey);
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      "x-api-key": apiKey,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Presentail OS catalog-attributes/brands API returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  // The endpoint may return { brands: [...] } or a bare array.
  if (Array.isArray(body)) {
    return { brands: body as OSCatalogAttributeBrandsResponse["brands"] };
  }
  return body as OSCatalogAttributeBrandsResponse;
}

/**
 * Fetch occasions from Presentail OS.
 * Throws on failure — caller handles graceful fallback.
 *
 * The OS API returns { items: [...], total, page, pageSize, totalPages } where
 * each item uses snake_case keys (is_featured, image_url). We normalise to the
 * OSProductOccasion shape used throughout the app.
 */
export async function fetchOsOccasions(
  config: PresentailOsConfig,
  options?: { sort?: string; citySlug?: string },
): Promise<OSOccasionsResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error("PRESENTAIL_OS_API_KEY is required for fetchOsOccasions.");
  }

  const url = new URL(`${baseUrl}/api/public/catalog/occasions`);
  url.searchParams.set("workspace", workspace);
  // Public endpoint — no apiKey query param; the x-api-key header is sufficient.
  url.searchParams.set("sort", options?.sort ?? "best_selling");
  if (options?.citySlug) {
    url.searchParams.set("city_slug", options.citySlug);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      "x-api-key": apiKey,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Presentail OS occasions API returned HTTP ${res.status}`);
  }

  const raw = (await res.json()) as {
    items?: Array<{
      id: number | string;
      slug: string;
      name: string;
      is_active?: boolean;
      is_featured?: boolean;
      image_url?: string | null;
      image_public_url?: string | null;
    }>;
    occasions?: Array<{
      id: string;
      slug: string;
      name: string;
      isActive?: boolean;
      featured?: boolean;
      image?: string | null;
      imagePublicUrl?: string | null;
    }>;
  };

  const toAbsUrl = (u: string | null | undefined) =>
    u ? (u.startsWith("http") ? u : `${baseUrl}${u}`) : null;

  // Support both the snake_case paginated shape { items } and the legacy
  // { occasions } shape. The legacy shape may still carry snake_case fields
  // (image_public_url, is_featured, numeric id), so normalise it too instead
  // of passing it through raw.
  if (Array.isArray(raw.occasions)) {
    return {
      occasions: raw.occasions.map((item) => {
        const o = item as Record<string, unknown> & typeof item;
        return {
          id: String(o.id),
          slug: o.slug,
          name: o.name,
          isActive: (o.isActive as boolean | undefined) ?? (o.is_active as boolean | undefined),
          featured:
            o.featured ?? (o.is_featured as boolean | undefined) ?? false,
          imagePublicUrl: toAbsUrl(
            (o.imagePublicUrl as string | null | undefined) ??
              (o.image_public_url as string | null | undefined),
          ),
          image: toAbsUrl(o.image ?? (o.image_url as string | null | undefined)),
        };
      }),
    };
  }

  const items = raw.items ?? [];
  return {
    occasions: items.map((item) => {
      const toAbs = (u: string | null | undefined) =>
        u ? (u.startsWith("http") ? u : `${baseUrl}${u}`) : null;
      return {
        id: String(item.id),
        slug: item.slug,
        name: item.name,
        isActive: item.is_active,
        featured: item.is_featured ?? false,
        // imagePublicUrl is the public-objects CDN path (accessible with x-api-key via our proxy).
        // image is the raw upload path (private, not directly servable).
        imagePublicUrl: toAbs(item.image_public_url),
        image: toAbs(item.image_url),
      };
    }),
  };
}

/**
 * Probe the OS for per-occasion statistics (e.g. total orders or sales by occasion).
 *
 * Tries `/api/statistics/occasions` first, then `/api/analytics/occasions`.
 * Returns `null` when neither endpoint exists (404) or when any network/parse
 * error occurs — the caller must fall back to product-level totalSales sums.
 *
 * A successful response is expected to be `{ occasions: [{ slug, totalOrders?,
 * totalRevenue?, totalSales? }, …] }` or a bare array with the same item shape.
 * Unknown shapes are treated as a graceful failure (returns null).
 */
export async function fetchOsOccasionStats(
  config: PresentailOsConfig,
): Promise<OSOccasionStatsResponse | null> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;
  if (!apiKey) return null;

  const headers = {
    Accept: "application/json",
    "User-Agent": "PresentailApp/1.0",
    "x-api-key": apiKey,
    Authorization: `Bearer ${apiKey}`,
  };

  /** Normalise a single raw item from the stats response into OSOccasionStat shape.
   * Handles both camelCase and snake_case field names from the OS API. */
  function normaliseStatItem(item: Record<string, unknown>): OSOccasionStatsResponse["occasions"][number] | null {
    const slug =
      typeof item["slug"] === "string" ? item["slug"] : null;
    if (!slug) return null;
    const totalOrders =
      typeof item["totalOrders"] === "number"
        ? item["totalOrders"]
        : typeof item["total_orders"] === "number"
          ? item["total_orders"]
          : undefined;
    const totalSales =
      typeof item["totalSales"] === "number"
        ? item["totalSales"]
        : typeof item["total_sales"] === "number"
          ? item["total_sales"]
          : undefined;
    const totalRevenue =
      typeof item["totalRevenue"] === "number"
        ? item["totalRevenue"]
        : typeof item["total_revenue"] === "number"
          ? item["total_revenue"]
          : undefined;
    return { slug, totalOrders, totalSales, totalRevenue };
  }

  async function tryEndpoint(path: string): Promise<OSOccasionStatsResponse | null> {
    try {
      const url = new URL(`${baseUrl}${path}`);
      url.searchParams.set("workspace", workspace);
      const res = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const raw = (await res.json()) as unknown;
      // Accept both { occasions: [...] } and a bare array; normalise each item.
      const rawItems: unknown[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && "occasions" in raw && Array.isArray((raw as { occasions: unknown }).occasions)
          ? (raw as { occasions: unknown[] }).occasions
          : null!;
      if (!Array.isArray(rawItems)) return null;
      const occasions = rawItems
        .map((item) =>
          item && typeof item === "object"
            ? normaliseStatItem(item as Record<string, unknown>)
            : null,
        )
        .filter((x): x is OSOccasionStatsResponse["occasions"][number] => x !== null);
      return { occasions };
    } catch {
      return null;
    }
  }

  return (await tryEndpoint("/api/statistics/occasions")) ?? (await tryEndpoint("/api/analytics/occasions"));
}

/**
 * Fetch the live status of a single order from Presentail OS.
 *
 * Uses a short 3-second timeout so a slow or unavailable OS does not block
 * the order-history response. Returns `null` on any failure so the caller
 * can fall back to the stored state.
 *
 * @param osOrderId  UUID assigned by OS when the order was created.
 */
export async function fetchOsOrderStatus(
  config: PresentailOsConfig,
  osOrderId: string,
): Promise<{ status: string } | null> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey || !osOrderId) return null;

  try {
    const url = new URL(`${baseUrl}/api/orders/${encodeURIComponent(osOrderId)}`);
    url.searchParams.set("workspace", workspace);
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "PresentailApp/1.0",
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as
      | { status?: string; state?: string }
      | null;
    if (!body) return null;
    const status = body.status ?? body.state;
    if (typeof status !== "string" || !status) return null;
    return { status };
  } catch {
    return null;
  }
}

/**
 * Submit a new order to Presentail OS.
 *
 * The API key is sent in the `x-api-key` header. The workspace slug is sent
 * as the `workspace` query parameter (and embedded in the payload body).
 *
 * Throws with a descriptive message if the API key is absent or the
 * request fails with a non-2xx status. The caller is responsible for
 * surfacing the error to the client.
 */
export async function createOsOrder(
  config: PresentailOsConfig,
  payload: OSCreateOrderPayload,
): Promise<OSCreateOrderResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error(
      "PRESENTAIL_OS_API_KEY is required but was not provided. " +
        "Set this environment variable to enable order submission to Presentail OS.",
    );
  }

  const url = new URL(`${baseUrl}/api/orders`);
  url.searchParams.set("workspace", workspace);
  // API key is sent as both Bearer token and x-api-key — OS /api/orders
  // requires Bearer auth; x-api-key is kept for backward compatibility.
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ ...payload, workspace }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // not JSON — use raw text snippet as fallback
    }
    const snippet = rawText.length > 500 ? rawText.slice(0, 500) + "…" : rawText;
    // Log the full raw body so ops can diagnose OS-side rejections.
    // (imported logger is not available here; use console.warn which the
    //  API server's pino transport captures at WARN level)
    console.warn(
      `[presentail-os] createOsOrder HTTP ${res.status} raw body: ${snippet}`,
    );
    const msg =
      (typeof parsed["error"] === "string" && parsed["error"]) ||
      (typeof parsed["message"] === "string" && parsed["message"]) ||
      snippet ||
      `Presentail OS order API returned HTTP ${res.status}`;
    throw new Error(msg);
  }

  const body = (await res.json().catch(() => ({}))) as OSCreateOrderResponse;
  return body;
}

// ── Coupons ──────────────────────────────────────────────────────────────────

export type OsCoupon = {
  id: string | number;
  code: string;
  discountType: string;
  discountValue: number;
  description?: string | null;
  minOrderUsd?: number | null;
  usageLimit?: number | null;
  expiresAt?: string | null;
  active?: boolean;
};

export type OsCouponValidateResult =
  | {
      valid: true;
      couponId: string | number;
      discountType: string;
      discountValue: number;
      discountAmountUsd: number;
      finalTotalUsd: number;
    }
  | { valid: false; error: string; message: string };

export async function fetchOsCoupons(
  config: PresentailOsConfig,
): Promise<OsCoupon[]> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } =
    config;
  const url = new URL(`${baseUrl}/api/coupons`);
  url.searchParams.set("workspace", workspace);
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`[presentail-os] fetchOsCoupons HTTP ${res.status}`); // i18n-ignore
  }
  const data = (await res.json().catch(() => ({}))) as {
    coupons?: OsCoupon[];
  };
  return Array.isArray(data.coupons) ? data.coupons : [];
}

export async function validateOsCoupon(
  config: PresentailOsConfig,
  code: string,
  cartItems: { osSlug: string; priceUsd: number; quantity: number }[],
  cartTotalUsd: number,
): Promise<OsCouponValidateResult> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } =
    config;
  const url = new URL(`${baseUrl}/api/coupons/validate`);
  url.searchParams.set("workspace", workspace);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ code, cartItems, cartTotalUsd }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text);
    } catch {}
    const message =
      (typeof parsed["message"] === "string" && parsed["message"]) ||
      text ||
      `OS coupon validation HTTP ${res.status}`; // i18n-ignore
    return { valid: false, error: "os_error", message }; // i18n-ignore
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!data["valid"]) {
    return {
      valid: false,
      error:
        typeof data["error"] === "string" ? data["error"] : "invalid", // i18n-ignore
      message:
        typeof data["message"] === "string"
          ? data["message"]
          : "Coupon code is not valid.", // i18n-ignore
    };
  }
  return {
    valid: true,
    couponId: (data["couponId"] ?? data["id"] ?? "") as string | number,
    discountType:
      typeof data["discountType"] === "string"
        ? data["discountType"]
        : "fixed_cart", // i18n-ignore
    discountValue: Number(data["discountValue"] ?? 0),
    discountAmountUsd: Number(data["discountAmountUsd"] ?? 0),
    finalTotalUsd: Number(data["finalTotalUsd"] ?? 0),
  };
}
