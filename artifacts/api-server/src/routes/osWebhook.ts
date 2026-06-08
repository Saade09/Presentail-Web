/**
 * Presentail OS webhook and admin sync endpoints.
 *
 * POST /api/os/webhook
 *   Receives event payloads pushed by Presentail OS. All requests must carry
 *   a valid HMAC-SHA256 signature in the `x-presentail-signature` header
 *   (format: `sha256=<hex>`). The signing string is:
 *
 *     `{x-presentail-delivery-id}.{x-presentail-timestamp}.{rawBody}`
 *
 *   Timestamps older than 5 minutes are rejected to prevent replay attacks.
 *
 *   Supported event types:
 *     exchange_rate.updated      — Update in-memory FX rate cache.
 *     delivery_config.updated    — Parse snake_case payload and update the OS
 *                                  locations cache (replaces the legacy full-
 *                                  locations push path).
 *     catalog_attribute.*        — Invalidate products cache.
 *     product.created            — Invalidate products cache.
 *     product.updated            — Invalidate products cache.
 *     product.deleted            — Invalidate products cache (full re-fetch;
 *                                  per-product removal is handled on next poll).
 *     banner.updated             — Map OS banner payload → HomepageBanner and
 *                                  replace active banner list in memory.
 *     order.status_updated       — Look up app_orders row and fire push + SMS.
 *     customer.created           — Upsert local customers row.
 *     customer.updated           — Upsert local customers row.
 *
 * POST /api/os/sync/products   Admin: invalidate products cache.
 * POST /api/os/sync/locations  Admin: invalidate locations cache.
 *
 * Authentication for admin endpoints: `x-push-admin-token` header.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { db, appOrdersTable, customersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import type { HomepageBanner } from "@workspace/api-zod";
import {
  storeLocationsFromWebhook,
  invalidateOsLocationsCache,
} from "../lib/osLocationsCache";
import { broadcastLocationsUpdated, getSseClientCount } from "../lib/sseBroadcast";
import { sendAllStoresDataRefreshPush } from "../lib/wooSync";
import { invalidateOsProductsCache, removeOsProductById } from "../lib/osProductsCache";
import { setFxRates } from "../lib/fxRateCache";
import { setActiveBannersFromWebhook } from "../data/homepageBanners";
import { sendOrderEventPush } from "../lib/orderEvents";
import { sendOrderEventSms } from "../lib/smsNotify";
import { upsertCustomer } from "../lib/customers";
import type { OrderState } from "../lib/orderEvents";
import type { OSLocationsResponse, OSTimeSlot } from "@workspace/presentail-os";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers: HMAC verification
// ---------------------------------------------------------------------------

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns true when the webhook timestamp is older than MAX_TIMESTAMP_SKEW_MS
 * (5 minutes) or cannot be parsed as a valid integer millisecond timestamp.
 * Exported for unit testing.
 */
export function isTimestampExpired(timestamp: string): boolean {
  const tsMs = parseInt(timestamp, 10);
  return !Number.isFinite(tsMs) || Date.now() - tsMs > MAX_TIMESTAMP_SKEW_MS;
}

export function verifyHmacSignature(
  secret: string,
  deliveryId: string,
  timestamp: string,
  rawBody: Buffer,
  signature: string,
): boolean {
  // Expected: sha256=<hex>
  const providedHex = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;

  if (!providedHex) return false;

  const signingString = `${deliveryId}.${timestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secret)
    .update(signingString, "utf8")
    .digest("hex");

  // Timing-safe comparison (both must be the same byte length; hex is ASCII).
  const expectedBuf = Buffer.from(expected, "hex");
  let providedBuf: Buffer;
  try {
    providedBuf = Buffer.from(providedHex, "hex");
  } catch {
    return false;
  }
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// ---------------------------------------------------------------------------
// Helpers: delivery_config.updated parser
//
// The OS webhook uses snake_case field names and a slightly different shape
// from GET /api/delivery-locations-ext. This parser normalises it into the
// OSLocationsResponse camelCase format so storeLocationsFromWebhook can
// reuse the existing transform pipeline.
// ---------------------------------------------------------------------------

type WebhookTimeSlotRaw = {
  label?: string;
  start_time?: string;
  end_time?: string;
  cutoff_hour?: number;
  extra_fee?: number;
};

type WebhookCityRaw = {
  id?: number;
  slug?: string;
  name?: string;
  is_active?: boolean;
  delivery_fee?: number;
  express_delivery_fee?: number;
  express_surcharge?: number;
  free_delivery_threshold?: number;
  free_delivery_enabled?: boolean;
  express_delivery_cutoff_time?: string;
  express_delivery_label?: string;
  express_available?: boolean;
  delivery_slots?: WebhookTimeSlotRaw[];
};

type WebhookCountryRaw = {
  code?: string;
  name?: string;
  currency?: string;
  is_active?: boolean;
  free_delivery_threshold?: number;
  free_delivery_enabled?: boolean;
  flag?: string;
  preferred_default_city_id?: string;
  cities?: WebhookCityRaw[];
};

/** Parse "HH:MM:SS" time string → hour integer (0–23). Returns undefined if invalid. */
function parseHour(timeStr?: string): number | undefined {
  if (!timeStr) return undefined;
  const h = parseInt(timeStr.split(":")[0] ?? "", 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : undefined;
}

function mapWebhookSlots(raw: WebhookTimeSlotRaw[] | undefined): OSTimeSlot[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const slots: OSTimeSlot[] = [];
  for (const s of raw) {
    const label = s.label ?? "";
    if (!label || seen.has(label)) continue;
    seen.add(label);
    slots.push({
      label,
      startHour: parseHour(s.start_time),
      endHour: parseHour(s.end_time),
      cutoffHour: s.cutoff_hour ?? parseHour(s.start_time) ?? 0,
      extraFee: s.extra_fee,
    });
  }
  return slots;
}

export function parseDeliveryConfigPayload(data: {
  countries?: WebhookCountryRaw[];
}): OSLocationsResponse {
  const countries = (data.countries ?? []).map((wc) => {
    const cities = (wc.cities ?? []).map((city) => {
      const deliveryFee = city.delivery_fee;
      const expressFeeTotal = city.express_delivery_fee;
      // expressSurcharge = total express fee minus the base delivery fee.
      // When express_surcharge is supplied directly, prefer it; otherwise derive it.
      const expressSurcharge =
        city.express_surcharge ??
        (expressFeeTotal != null && deliveryFee != null
          ? expressFeeTotal - deliveryFee
          : undefined);
      return {
        id: city.id ?? 0,
        slug: city.slug ?? "",
        name: city.name ?? "",
        isActive: city.is_active ?? true,
        deliveryFee,
        expressAvailable: city.express_available ?? expressFeeTotal != null,
        expressDeliveryLabel: city.express_delivery_label ?? "",
        sameDayCutoffHour: parseHour(city.express_delivery_cutoff_time),
        timeSlots: mapWebhookSlots(city.delivery_slots),
        expressFeeTotal,
        expressSurcharge,
        freeDeliveryThreshold: city.free_delivery_threshold,
        freeDeliveryEnabled: city.free_delivery_enabled,
      };
    });
    return {
      code: wc.code ?? "",
      name: wc.name ?? "",
      currency: wc.currency,
      isActive: wc.is_active,
      flag: wc.flag,
      preferredDefaultCityId: wc.preferred_default_city_id,
      freeDeliveryThreshold: wc.free_delivery_threshold,
      freeDeliveryEnabled: wc.free_delivery_enabled,
      cities,
    };
  });
  return { countries };
}

// ---------------------------------------------------------------------------
// Helpers: banner mapper
//
// Maps the OS webhook banner payload (snake_case) to HomepageBanner (camelCase).
// ---------------------------------------------------------------------------

type WebhookBannerMediaRaw = {
  media_type?: string;
  media_url?: string;
  link_url?: string;
};

type WebhookBannerRaw = {
  id?: string;
  country_codes?: string[];
  country_code?: string;
  title?: string;
  subtitle?: string;
  cta_text?: string;
  // Nested form (preferred by OS):
  desktop?: WebhookBannerMediaRaw;
  mobile?: WebhookBannerMediaRaw;
  // Flattened snake_case form (legacy / fallback):
  desktop_media_type?: string;
  desktop_media_url?: string;
  desktop_link_url?: string;
  mobile_media_type?: string;
  mobile_media_url?: string;
  mobile_link_url?: string;
  sort_order?: number;
  is_active?: boolean;
  start_at?: string | null;
  end_at?: string | null;
};

function mapWebhookBanners(raw: WebhookBannerRaw[]): HomepageBanner[] {
  const banners: HomepageBanner[] = [];
  for (const b of raw) {
    if (!b.id) continue;
    // A single OS banner with multiple country_codes expands to one entry per
    // country code. A "*" code means the banner applies globally.
    const codes =
      Array.isArray(b.country_codes) && b.country_codes.length > 0
        ? b.country_codes
        : [b.country_code ?? "*"];
    // Prefer nested desktop/mobile objects; fall back to flattened fields.
    const desktopMediaType = (b.desktop?.media_type ?? b.desktop_media_type) as
      | HomepageBanner["desktopMediaType"]
      | undefined;
    const desktopMediaUrl = b.desktop?.media_url ?? b.desktop_media_url ?? "";
    const desktopLinkUrl = b.desktop?.link_url ?? b.desktop_link_url ?? "";
    const mobileMediaType = (b.mobile?.media_type ?? b.mobile_media_type) as
      | HomepageBanner["mobileMediaType"]
      | undefined;
    const mobileMediaUrl = b.mobile?.media_url ?? b.mobile_media_url ?? "";
    const mobileLinkUrl = b.mobile?.link_url ?? b.mobile_link_url ?? "";
    for (const cc of codes) {
      const id = codes.length > 1 ? `${b.id}-${cc.toLowerCase()}` : b.id;
      banners.push({
        id,
        countryCode: cc,
        title: b.title,
        subtitle: b.subtitle,
        ctaText: b.cta_text,
        desktopMediaType: desktopMediaType ?? "image",
        desktopMediaUrl,
        desktopLinkUrl,
        mobileMediaType: mobileMediaType ?? "image",
        mobileMediaUrl,
        mobileLinkUrl,
        sortOrder: b.sort_order ?? 0,
        isActive: b.is_active ?? true,
        startsAt: b.start_at ? new Date(b.start_at) : undefined,
        endsAt: b.end_at ? new Date(b.end_at) : undefined,
      });
    }
  }
  return banners;
}

// ---------------------------------------------------------------------------
// Helpers: order status mapping
// ---------------------------------------------------------------------------

const OS_STATUS_MAP: Record<string, OrderState> = {
  confirmed: "confirmed",
  processing: "confirmed",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  cancelled: "cancelled",
  refunded: "refunded",
};

function mapOsOrderStatus(osStatus: string): OrderState | null {
  const normalized = (osStatus ?? "").toLowerCase().replace(/[-\s]/g, "_");
  return OS_STATUS_MAP[normalized] ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/os/webhook — main dispatcher
// ---------------------------------------------------------------------------

router.post("/os/webhook", async (req, res) => {
  const secret = process.env.PRESENTAIL_OS_WEBHOOK_SECRET ?? "";

  if (!secret) {
    req.log.warn(
      "osWebhook: PRESENTAIL_OS_WEBHOOK_SECRET is not configured — rejecting webhook",
    );
    return res.status(503).json({ ok: false, message: "Webhook secret not configured" }); // i18n-ignore
  }

  // ── HMAC-SHA256 signature verification ─────────────────────────────────
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    return res.status(400).json({ ok: false, message: "Empty body" }); // i18n-ignore
  }

  const deliveryId = (req.headers["x-presentail-delivery-id"] as string) ?? "";
  const timestamp = (req.headers["x-presentail-timestamp"] as string) ?? "";
  const signature = (req.headers["x-presentail-signature"] as string) ?? "";

  if (!deliveryId || !timestamp || !signature) {
    return res.status(401).json({ ok: false, message: "Missing signature headers" }); // i18n-ignore
  }

  if (!verifyHmacSignature(secret, deliveryId, timestamp, rawBody, signature)) {
    req.log.warn({ deliveryId }, "osWebhook: HMAC signature mismatch — rejecting webhook");
    return res.status(401).json({ ok: false, message: "Invalid signature" }); // i18n-ignore
  }

  // ── Replay protection ───────────────────────────────────────────────────
  if (isTimestampExpired(timestamp)) {
    req.log.warn(
      { deliveryId, timestamp },
      "osWebhook: webhook timestamp too old or invalid — rejecting",
    );
    return res.status(401).json({ ok: false, message: "Timestamp too old" }); // i18n-ignore
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let payload: { event?: string; data?: unknown };
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as typeof payload;
  } catch {
    return res.status(400).json({ ok: false, message: "Invalid JSON body" }); // i18n-ignore
  }

  const event = (payload.event ?? "").toLowerCase();
  const data = payload.data as Record<string, unknown> | undefined;

  req.log.info({ event, deliveryId }, "osWebhook: received event");

  // ── Route by event type ─────────────────────────────────────────────────

  // exchange_rate.updated ─────────────────────────────────────────────────
  if (event === "exchange_rate.updated") {
    const rates = data?.rates as Record<string, number> | undefined;
    if (rates && typeof rates === "object") {
      setFxRates(rates);
      req.log.info(
        { currencyCodes: Object.keys(rates) },
        "osWebhook: FX rates updated",
      );
    } else {
      req.log.warn({ data }, "osWebhook: exchange_rate.updated payload missing rates object");
    }
    return res.json({ ok: true });
  }

  // delivery_config.updated ───────────────────────────────────────────────
  if (event === "delivery_config.updated") {
    try {
      const locations = parseDeliveryConfigPayload(
        data as { countries?: WebhookCountryRaw[] },
      );
      storeLocationsFromWebhook(locations);
      req.log.info(
        { countryCount: locations.countries.length },
        "osWebhook: delivery config updated from webhook",
      );

      // Notify all connected web clients immediately so open browser tabs
      // refetch delivery-locations without waiting for the 10-minute poll.
      broadcastLocationsUpdated();
      req.log.info(
        { sseClients: getSseClientCount() },
        "osWebhook: SSE locations-updated broadcast sent",
      );

      // Send a silent data_refresh push to all mobile devices so the app
      // picks up city changes immediately rather than on the next sync tick.
      void sendAllStoresDataRefreshPush().then(() => {
        req.log.info("osWebhook: mobile data_refresh push sent for locations update");
      });
    } catch (err: any) {
      req.log.warn(
        { err: err?.message },
        "osWebhook: delivery_config.updated parse error — ignoring",
      );
    }
    return res.json({ ok: true });
  }

  // catalog_attribute.* / catalog_attributes.changed / catalog.products.changed
  if (
    event.startsWith("catalog_attribute") ||
    event === "catalog_attributes.changed" ||
    event === "catalog.products.changed"
  ) {
    invalidateOsProductsCache();
    req.log.info({ event }, "osWebhook: products cache invalidated (catalog change)");
    return res.json({ ok: true });
  }

  // product.created / product.updated — full cache invalidation ──────────
  if (event === "product.created" || event === "product.updated") {
    invalidateOsProductsCache();
    req.log.info({ event }, "osWebhook: products cache invalidated");
    return res.json({ ok: true });
  }

  // product.deleted — immediate per-id removal + full refetch ────────────
  if (event === "product.deleted") {
    const productId = (data as Record<string, unknown>)?.id;
    if (productId != null) {
      removeOsProductById(productId as number | string);
    } else {
      invalidateOsProductsCache();
    }
    req.log.info(
      { event, productId },
      "osWebhook: product deleted — removed from cache and refetch queued",
    );
    return res.json({ ok: true });
  }

  // banner.updated ────────────────────────────────────────────────────────
  if (event === "banner.updated" || event === "catalog.banners.changed") {
    const rawBanners = (data?.banners ?? (Array.isArray(data) ? data : [])) as WebhookBannerRaw[];
    const banners = mapWebhookBanners(rawBanners);
    // Accept empty array as a valid "clear all banners" instruction.
    const changed = setActiveBannersFromWebhook(banners);
    req.log.info(
      { bannerCount: banners.length, changed },
      "osWebhook: homepage banners updated from webhook",
    );
    return res.json({ ok: true });
  }

  // order.status_updated ──────────────────────────────────────────────────
  if (event === "order.status_updated") {
    void handleOrderStatusUpdated(req, data).catch((err: unknown) => {
      req.log.warn(
        { err: (err as Error)?.message, event },
        "osWebhook: order.status_updated handler error (non-fatal)",
      );
    });
    return res.json({ ok: true });
  }

  // customer.created / customer.updated ───────────────────────────────────
  if (event === "customer.created" || event === "customer.updated") {
    void handleCustomerUpsert(req, data).catch((err: unknown) => {
      req.log.warn(
        { err: (err as Error)?.message, event },
        "osWebhook: customer upsert error (non-fatal)",
      );
    });
    return res.json({ ok: true });
  }

  // Unrecognised event — accept but log so we can detect unknown event types.
  req.log.info({ event, deliveryId }, "osWebhook: unrecognised event type — ignoring");
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// order.status_updated handler (async, fire-and-forget from the route)
// ---------------------------------------------------------------------------

async function handleOrderStatusUpdated(
  req: { log: { info?: (...a: any[]) => void; warn?: (...a: any[]) => void } },
  data: Record<string, unknown> | undefined,
): Promise<void> {
  const appOrderId = typeof data?.app_order_id === "string" ? data.app_order_id : null;
  const osOrderId = typeof data?.os_order_id === "string" ? data.os_order_id : null;
  const osStatus = typeof data?.status === "string" ? data.status : null;

  if (!osStatus) {
    req.log.warn?.({ data }, "osWebhook: order.status_updated missing status field");
    return;
  }

  const state = mapOsOrderStatus(osStatus);
  if (!state) {
    req.log.info?.({ osStatus }, "osWebhook: unmapped OS order status — skipping push");
    return;
  }

  // Look up app_orders row by appOrderId (preferred) or osOrderId.
  const conditions = [];
  if (appOrderId) conditions.push(eq(appOrdersTable.appOrderId, appOrderId));
  if (osOrderId) conditions.push(eq(appOrdersTable.osOrderId, osOrderId));

  if (conditions.length === 0) {
    req.log.warn?.({ data }, "osWebhook: order.status_updated missing order identifiers");
    return;
  }

  const where = conditions.length === 1 ? conditions[0] : or(...conditions);
  const rows = await db
    .select({
      appOrderId: appOrdersTable.appOrderId,
      userId: appOrdersTable.userId,
      deviceId: appOrdersTable.deviceId,
      recipientName: appOrdersTable.recipientName,
      senderPhone: appOrdersTable.senderPhone,
      storeKey: appOrdersTable.storeKey,
    })
    .from(appOrdersTable)
    .where(where)
    .limit(1);

  const row = rows[0];
  if (!row) {
    req.log.warn?.(
      { appOrderId, osOrderId, state },
      "osWebhook: order.status_updated — no matching app_orders row found",
    );
    return;
  }

  const resolvedAppOrderId = row.appOrderId;

  // Update the stored state.
  await db
    .update(appOrdersTable)
    .set({ state, updatedAt: new Date() })
    .where(eq(appOrdersTable.appOrderId, resolvedAppOrderId));

  // Fire push notification (best-effort).
  const pushCount = await sendOrderEventPush({
    state,
    appOrderId: resolvedAppOrderId,
    userId: row.userId,
    deviceId: row.deviceId,
    recipientName: row.recipientName,
  }).catch(() => 0);

  // Fire SMS/WhatsApp (best-effort).
  const smsResult = await sendOrderEventSms({
    state,
    appOrderId: resolvedAppOrderId,
    senderPhone: row.senderPhone,
    recipientName: row.recipientName,
    storeKey: row.storeKey,
  }).catch(() => ({ smsSent: 0, smsSkipped: true }));

  req.log.info?.(
    {
      appOrderId: resolvedAppOrderId,
      state,
      pushCount,
      smsSent: smsResult.smsSent,
      smsSkipped: smsResult.smsSkipped,
    },
    "osWebhook: order status push + SMS dispatched",
  );
}

// ---------------------------------------------------------------------------
// customer.created / customer.updated handler (async, fire-and-forget)
// ---------------------------------------------------------------------------

async function handleCustomerUpsert(
  req: { log: { info?: (...a: any[]) => void; warn?: (...a: any[]) => void } },
  data: Record<string, unknown> | undefined,
): Promise<void> {
  const websiteUserId =
    typeof data?.website_user_id === "number"
      ? data.website_user_id
      : typeof data?.website_user_id === "string"
        ? parseInt(data.website_user_id, 10) || null
        : null;

  const email = typeof data?.email === "string" && data.email ? data.email : null;
  const phone = typeof data?.phone === "string" ? data.phone : undefined;
  const firstName = typeof data?.first_name === "string" ? data.first_name : undefined;
  const lastName = typeof data?.last_name === "string" ? data.last_name : undefined;
  const country = typeof data?.country === "string" ? data.country : undefined;
  const city = typeof data?.city === "string" ? data.city : undefined;

  // Require at least one stable identifier to find or create a customer.
  if (!websiteUserId && !email) {
    req.log.warn?.({ data }, "osWebhook: customer event has no website_user_id or email — skipping upsert");
    return;
  }

  // 1. Look up by website_user_id (maps to wcCustomerId) when provided.
  //    This is the preferred match — works even when email is null (e.g.
  //    OS customers created via social auth without an email address).
  let preferredCustomerId: number | undefined;
  if (websiteUserId) {
    const [existing] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.wcCustomerId, websiteUserId))
      .limit(1);
    if (existing) {
      preferredCustomerId = existing.id;
    }
  }

  // 2. When no row was found by website_user_id and email is absent (e.g.
  //    OS customers created via social auth), use a deterministic placeholder
  //    email so we can still create a local row. If a real email arrives on a
  //    future OS event, the wcCustomerId lookup above will find this row and
  //    update it — the placeholder is never surfaced to shoppers.
  const effectiveEmail =
    email ??
    (websiteUserId && !preferredCustomerId
      ? `os-user-${websiteUserId}@presentail-os.placeholder`
      : undefined);

  if (!preferredCustomerId && !effectiveEmail) {
    req.log.warn?.(
      { data },
      "osWebhook: customer event has no website_user_id or email — skipping upsert",
    );
    return;
  }

  const { customer, created } = await upsertCustomer({
    email: effectiveEmail,
    phone,
    firstName,
    lastName,
    country,
    city,
    preferredCustomerId,
    source: "presentail-os",
  });

  // Persist website_user_id → customers.wc_customer_id so future OS events
  // with the same user (even null-email ones) can still be matched by id.
  if (websiteUserId && customer.wcCustomerId !== websiteUserId) {
    await db
      .update(customersTable)
      .set({ wcCustomerId: websiteUserId, updatedAt: new Date() })
      .where(eq(customersTable.id, customer.id));
  }

  req.log.info?.(
    { customerId: customer.id, websiteUserId, email, created },
    "osWebhook: customer upserted",
  );
}

// ---------------------------------------------------------------------------
// Admin: manual cache invalidation endpoints
// ---------------------------------------------------------------------------

function requireAdminToken(
  req: Parameters<Parameters<IRouter["post"]>[1]>[0],
  res: Parameters<Parameters<IRouter["post"]>[1]>[1],
): boolean {
  const adminToken = process.env.PUSH_ADMIN_TOKEN ?? "";
  const provided = req.headers["x-push-admin-token"] ?? "";
  if (!adminToken) {
    res.status(503).json({ ok: false, message: "Admin token not configured" }); // i18n-ignore
    return false;
  }
  if (provided !== adminToken) {
    res.status(401).json({ ok: false, message: "Unauthorized" }); // i18n-ignore
    return false;
  }
  return true;
}

router.post("/os/sync/products", (req, res) => {
  if (!requireAdminToken(req, res)) return;
  invalidateOsProductsCache();
  req.log.info("osWebhook: products cache invalidated via manual sync trigger");
  return res.json({ ok: true, message: "Products cache invalidated — fresh fetch queued" }); // i18n-ignore
});

router.post("/os/sync/locations", (req, res) => {
  if (!requireAdminToken(req, res)) return;
  invalidateOsLocationsCache();
  req.log.info("osWebhook: locations cache invalidated via manual sync trigger");
  return res.json({ ok: true, message: "Cache invalidated — fresh fetch queued" }); // i18n-ignore
});

export default router;
