import { Router, type IRouter } from "express";
import { getRates, SUPPORTED_CURRENCIES } from "../lib/fx";

const router: IRouter = Router();

// Public read-only endpoint the mobile app calls on launch (and periodically)
// to keep its display rates in sync with what the server will charge.
router.get("/fx/rates", async (_req, res) => {
  try {
    const c = await getRates();
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
      .json({ ok: false, message: err?.message ?? "Failed to load FX rates" });
  }
});

export default router;
