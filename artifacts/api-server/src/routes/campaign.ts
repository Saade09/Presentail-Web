import { Router } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";
import { authenticate } from "../lib/auth";
import { isFirstOrderEligible } from "../lib/couponValidation";
import { GetBeirutLateNightCampaignResponse } from "@workspace/api-zod";
import {
  getLocations,
  getLocationsDataStatus,
} from "../lib/osLocationsCache";
import {
  getOsProducts,
  getOsProductPricingMap,
  getStoreLastRefreshedAt,
} from "../lib/osProductsCache";
import {
  buildBeirutLateNightCampaign,
  type BeirutLocationContext,
} from "../lib/beirutLateNightCampaign";

const router = Router();

const eligibilityLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    // Fail open as "eligible unknown" so the landing page degrades gracefully.
    res.status(200).json({ ok: true, eligible: true, known: false });
  },
});

/**
 * GET /api/campaign/first-order-eligibility
 *
 * Advisory self-check used by the campaign landing page to decide whether to
 * show the "10% off your first order" promo. The check runs ONLY against the
 * authenticated caller's own account email — no email parameter is accepted,
 * so unauthenticated callers cannot probe order history for arbitrary
 * addresses. Guests always get { eligible: true, known: false } (the promo is
 * a display hint; the server re-validates eligibility at coupon application
 * and again at order creation, which are the enforcement points).
 */
router.get("/campaign/first-order-eligibility", eligibilityLimiter, async (req, res) => {
  try {
    const auth = await authenticate(req.header("authorization"), req);
    if (!auth.ok) {
      return res.json({ ok: true, eligible: true, known: false });
    }
    const localId = auth.localCustomerId ?? auth.customerId;
    const [row] = await db
      .select({ email: customersTable.email })
      .from(customersTable)
      .where(eq(customersTable.id, localId))
      .limit(1);
    if (!row?.email) {
      return res.json({ ok: true, eligible: true, known: false });
    }
    const eligible = await isFirstOrderEligible(row.email);
    return res.json({ ok: true, eligible, known: true });
  } catch {
    return res.json({ ok: true, eligible: true, known: false });
  }
});

// ── GET /campaign/beirut-late-night ──────────────────────────────────────────
//
// Public, fail-closed endpoint. Evaluates the Beirut late-night campaign
// server-side in Asia/Beirut. Always returns cache-busting headers.

router.get("/campaign/beirut-late-night", async (req, res): Promise<void> => {
  // Always prevent caching — campaign status must be fresh
  res.set({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  });

  try {
    // Resolve Beirut city from OS cache
    const locationsStatus = getLocationsDataStatus();
    const countries = getLocations();
    const lb = countries.find((c) => c.code === "LB");
    const beirutCity = lb?.cities.find(
      (c) =>
        c.id === "lb-beirut" ||
        c.name.toLowerCase() === "beirut",
    );

    const location: BeirutLocationContext = beirutCity
      ? {
          locationsStatus,
          operationsConfigVerified: beirutCity.operationsConfigVerified,
          expressAvailable: beirutCity.expressAvailable,
          sameDayCutoffHour: beirutCity.sameDayCutoffHour,
          sameDayCutoffMinute: beirutCity.sameDayCutoffMinute,
          timeSlots: beirutCity.timeSlots,
          slotsByDay: beirutCity.slotsByDay,
          countryActive: lb?.isActive ?? false,
          cityActive: beirutCity.isActive ?? false,
        }
      : {
          locationsStatus,
          operationsConfigVerified: false,
          expressAvailable: false,
          sameDayCutoffHour: 22,
          sameDayCutoffMinute: 0,
          timeSlots: [],
          slotsByDay: undefined,
          countryActive: false,
          cityActive: false,
        };

    const products = getOsProducts("lebanon");
    const pricingMap = getOsProductPricingMap();
    const productRefreshedAt = getStoreLastRefreshedAt("lebanon");

    const result = buildBeirutLateNightCampaign({
      nowMs: Date.now(),
      location,
      products,
      pricingMap,
      productRefreshedAt,
    });

    res.json(GetBeirutLateNightCampaignResponse.parse(result));
  } catch (err: unknown) {
    req.log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "campaign/beirut-late-night: unexpected error",
    );
    // Fail closed — return unavailable rather than 500
    const fallback = GetBeirutLateNightCampaignResponse.parse({
      campaignKey: "campaign-beirut-late-night",
      status: "unavailable",
      reason: "source-stale",
      timeZone: "Asia/Beirut",
      evaluatedAt: new Date().toISOString(),
      quoteExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      nominalCutoffAt: new Date().toISOString(),
      effectiveCutoffAt: null,
      cutoffLabel: null,
      sourceFreshness: {
        locationsStatus: "fallback",
        productRefreshedAt: null,
      },
      deliveryWindow: null,
      nextAvailableWindow: null,
      availableTonight: { title: "Available Tonight", subtitle: "", viewAllHref: "/category/flowers", products: [] },
      luxury: { title: "Late-Night Luxury Arrangements", subtitle: "", viewAllHref: "/category/lux-arrangements", products: [] },
    });
    res.json(fallback);
  }
});

export default router;
