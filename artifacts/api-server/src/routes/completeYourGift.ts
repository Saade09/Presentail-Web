/**
 * GET /api/products/complete-your-gift
 *
 * "Complete Your Gift" PDP upsell — returns at most one best product for each
 * of four fixed category slots (Chocolate, Cake, Balloon, Stuffed animal, in
 * that exact order) after eligibility filtering and versioned rules-based
 * ranking. Replaces "Frequently Bought Together" when the CYG_ROLLOUT flag
 * enables it; when disabled the frontend keeps using the old FBT endpoint.
 *
 * Query params:
 *   slug      — OS product slug of the anchor product (required)
 *   store     — lebanon | dubai | abudhabi | cyprus (default lebanon)
 *   city      — optional delivery city id (e.g. "ae-dubai" or "dubai")
 *   date      — optional delivery date (YYYY-MM-DD; accepted for future use)
 *   cart      — optional comma-separated product slugs already in the cart
 *   sessionId — optional stable session id (rollout cohort + exploration)
 */

import { Router, type IRouter } from "express";
import { z } from "zod";
import { getOsProducts, getOsProductBySlug, getOsProductPricingMap } from "../lib/osProductsCache";
import { getMetricsCache } from "../lib/productRankingService";
import { getDeliverySlots } from "../lib/osLocationsCache";
import { getRate, roundForCurrency, type SupportedCurrency } from "../lib/fx";
import { resolveStoreByKey } from "../lib/wooStore";
import {
  CYG_SLOTS,
  CYG_RULES_VERSION,
  CYG_EXPERIMENT_ID,
  CYG_RANKING_CONFIG,
  getCygAssignment,
  filterCygCandidates,
  rankCygCandidates,
  applyExploration,
  buildCygToken,
  isDateDeliverableForCity,
  type CygSlotKey,
} from "../lib/completeYourGift";
import type { StoreKey } from "../lib/wooStore";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const QuerySchema = z.object({
  slug: z.string().min(1).max(300),
  store: z.enum(["lebanon", "dubai", "abudhabi", "cyprus"]).optional().default("lebanon"),
  city: z.string().max(64).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  cart: z.string().max(4000).optional(),
  sessionId: z.string().max(64).optional(),
});

type SlotResponse = {
  category: CygSlotKey;
  slotIndex: number;
  productSlug: string;
  osNumericId: string | null;
  wcId: number | null;
  name: string;
  imageUrl: string | null;
  imageAlt: string;
  /** Incremental price added to the order, in the store's display currency. */
  incrementalPrice: number;
  /** Crossed-out regular price in the store's display currency (when on sale). */
  regularPrice: number | null;
  /** Store display currency (USD for Lebanon, AED for UAE, EUR for Cyprus). */
  currency: string;
  /** USD reference prices (OS base currency), for analytics comparability. */
  incrementalPriceUsd: number;
  regularPriceUsd: number | null;
  inStock: boolean;
  /** Whether required options exist (e.g. mandatory personalisation on cakes). */
  requiresOptions: boolean;
  quantity: { min: number; max: number };
  scoreRef: { score: number; metricsSource: string; explored: boolean };
  rulesVersion: string;
  token: string;
  fallbackReason: string | null;
};

router.get("/products/complete-your-gift", async (req, res) => {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { slug: anchorSlug, store, city, date, cart, sessionId } = parsed.data;
  const storeKey = store as StoreKey;
  const startedAt = Date.now();

  const assignment = getCygAssignment(sessionId);
  const experiment = {
    id: CYG_EXPERIMENT_ID,
    variant: assignment.variant,
    mode: assignment.mode,
  };

  if (!assignment.enabled) {
    res.json({ enabled: false, experiment, rulesVersion: CYG_RULES_VERSION, slots: [] });
    return;
  }

  // Read-only catalog endpoint — use getOsProducts, never hasOsProducts.
  const catalog = getOsProducts(storeKey);
  if (!catalog) {
    res.json({ enabled: true, experiment, rulesVersion: CYG_RULES_VERSION, slots: [] });
    return;
  }
  const anchor = getOsProductBySlug(anchorSlug, storeKey);
  if (!anchor) {
    res.status(404).json({ error: "Anchor product not found" }); // i18n-ignore — API error surface
    return;
  }

  // Delivery-date gate: when a city + date are selected, verify the date is
  // servable per the authoritative OS delivery slot config. An undeliverable
  // date means NOTHING in the module could arrive with the gift — return
  // empty slots with an explicit reason instead of misleading recommendations.
  if (city && date) {
    const deliverable = isDateDeliverableForCity({
      slots: getDeliverySlots(city),
      date,
      storeKey,
    });
    if (!deliverable) {
      res.json({
        enabled: true,
        experiment,
        rulesVersion: CYG_RULES_VERSION,
        slots: [],
        reason: "date_not_deliverable",
      });
      return;
    }
  }

  const cartSlugs = new Set(
    (cart ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const metricsMap = getMetricsCache();
  const { bySlot, exclusionReasonBySlot } = filterCygCandidates({
    catalog,
    anchorSlug,
    cartSlugs,
    cityId: city,
    metricsMap,
  });

  // Never recommend the anchor's own category (e.g. don't upsell a cake on a
  // cake PDP) and dedupe across slots is implicit: each product maps to a
  // single slot and each slot yields at most one product.
  const anchorCategorySlugs = new Set(
    anchor.categories.map((c) => c.slug ?? c.id ?? "").filter(Boolean),
  );

  const pricingMap = getOsProductPricingMap();
  const storeConfig = resolveStoreByKey(storeKey);
  const storeCurrency = storeConfig.currencyCode as SupportedCurrency;
  // Resolve the USD→store-currency rate once per request. USD stores skip FX.
  let fxRate = 1;
  if (storeCurrency !== "USD") {
    try {
      fxRate = await getRate(storeCurrency);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), storeCurrency },
        "completeYourGift: FX rate lookup failed — serving USD reference prices",
      );
    }
  }
  const toStoreCurrency = (usd: number): number =>
    storeCurrency === "USD" ? usd : roundForCurrency(usd * fxRate, storeCurrency);

  const slots: SlotResponse[] = [];
  const usedSlugs = new Set<string>([anchorSlug]);

  CYG_SLOTS.forEach((slotDef, slotIndex) => {
    // Skip slots that overlap the anchor's own category.
    if (slotDef.categorySlugs.some((s) => anchorCategorySlugs.has(s))) return;

    const candidates = (bySlot.get(slotDef.key) ?? []).filter((p) => !usedSlugs.has(p.id));
    const ranked = rankCygCandidates(candidates, metricsMap, CYG_RANKING_CONFIG);
    const pick = applyExploration({
      ranked,
      slot: slotDef.key,
      sessionId,
      anchorSlug,
      config: CYG_RANKING_CONFIG,
    });
    if (!pick) return; // empty slot — omit cleanly, never pad

    const { chosen, explored } = pick;
    const p = chosen.product;
    usedSlugs.add(p.id);

    const pricing = p.osNumericId != null ? pricingMap.get(String(p.osNumericId)) : undefined;
    const salePrice = pricing?.discountPriceUsd ?? null;
    const isDiscounted = salePrice != null && salePrice > 0 && salePrice < p.price;
    const incrementalPriceUsd = isDiscounted ? salePrice : p.price;
    const regularPriceUsd = pricing?.regularPriceUsd ?? null;

    // Store-currency prices. For AED stores prefer the OS-authored AED sale
    // price over an FX conversion when the product is discounted.
    const aedSale = pricing?.discountPriceAed ?? null;
    const incrementalPrice =
      storeCurrency === "AED" && isDiscounted && aedSale != null && aedSale > 0
        ? aedSale
        : toStoreCurrency(incrementalPriceUsd);
    const regularPrice = regularPriceUsd != null ? toStoreCurrency(regularPriceUsd) : null;

    const firstImage = p.images?.[0];

    // Cakes (and anything with mandatory personalisation) require options.
    const requiresOptions =
      (p.personalisationRequired ?? false) || (p.hasLetterField ?? false);

    slots.push({
      category: slotDef.key,
      slotIndex,
      productSlug: p.id,
      osNumericId: p.osNumericId != null ? String(p.osNumericId) : null,
      wcId: p.wcId ?? null,
      name: p.name,
      imageUrl: firstImage?.url ?? null,
      imageAlt: firstImage?.alt ?? p.name,
      incrementalPrice,
      regularPrice,
      currency: storeCurrency,
      incrementalPriceUsd,
      regularPriceUsd,
      inStock: p.inStock,
      requiresOptions,
      quantity: { min: 1, max: 10 },
      scoreRef: { score: chosen.score, metricsSource: chosen.metricsSource, explored },
      rulesVersion: CYG_RULES_VERSION,
      token: buildCygToken({ anchor: anchorSlug, slot: slotDef.key, productSlug: p.id, explored }),
      fallbackReason:
        chosen === ranked[0] ? null : (exclusionReasonBySlot.get(slotDef.key) ?? "exploration"),
    });
  });

  // Standard observability: latency + empty-result rate.
  logger.info(
    {
      anchorSlug,
      store: storeKey,
      slotsReturned: slots.length,
      empty: slots.length === 0,
      latencyMs: Date.now() - startedAt,
      rulesVersion: CYG_RULES_VERSION,
      variant: assignment.variant,
    },
    "completeYourGift: served",
  );

  res.json({ enabled: true, experiment, rulesVersion: CYG_RULES_VERSION, slots });
});

export default router;
