import { Router, type IRouter } from "express";
import { db, analyticsEventsTable } from "@workspace/db";
import { getRates, SUPPORTED_CURRENCIES } from "../lib/fx";

const router: IRouter = Router();

const PUBLIC_FX_RATES_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

// Public read-only endpoint the mobile app calls on launch (and periodically)
// to keep its display rates in sync with what the server will charge.
router.get("/fx/rates", async (req, res) => {
  try {
    const c = await getRates();
    if (c.source === "fallback") {
      req.log.warn(
        { fetchedAt: c.fetchedAt },
        "fx: serving fallback rates — live fetch unavailable",
      );
      // Persist a durable server-side metric so ops can measure how many
      // requests were served stale rates (queryable via the analytics table,
      // complementing the fxRatesFallbackMonitor Slack alert). Best-effort.
      void db
        .insert(analyticsEventsTable)
        .values({
          name: "fx_rates_fallback",
          platform: "server",
          action: null,
          surface: null,
          appVersion: null,
          errorCode: null,
          productId: null,
          sessionId: null,
          userId: null,
          signedIn: false,
        })
        .catch((err: unknown) => {
          req.log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "fx: failed to persist fallback metric",
          );
        });
    }
    res.setHeader("Cache-Control", PUBLIC_FX_RATES_CACHE_CONTROL);
    return res.json({
      ok: true,
      base: c.base,
      rates: c.rates,
      fetchedAt: c.fetchedAt,
      source: c.source,
      supported: SUPPORTED_CURRENCIES,
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to load FX rates" }); // i18n-ignore
  }
});

export default router;
