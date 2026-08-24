/**
 * Public (unauthenticated) search over verified Address Book places from
 * Presentail OS — powers landmark recognition in the web checkout's
 * Delivery Details field ("AUB" → the verified AUBMC record).
 *
 * Safety contract:
 *   - Only verified + published + checkout-enabled places are ever returned
 *     (filtering happens at index-build time in osPlacesCache).
 *   - Only the public-safe field projection leaves the server — never
 *     internal notes, contacts, or verification history.
 *   - ANY failure (bad input, OS down, flag dark, internal error) responds
 *     200 { ok: true, places: [] } so checkout free-text entry can never be
 *     broken by this endpoint.
 *   - Search spans all districts of the requested country, not just the
 *     shopper's currently selected one.
 */

import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { searchAddressBookPlaces } from "../lib/osPlacesCache";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Typed with debounce (~300ms) client-side, so the ceiling is generous for
// real shoppers while still capping scripted scraping.
const placesSearchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Rate-limited callers get the same harmless empty shape — the checkout
  // field silently degrades to free text.
  handler: (_req, res) => {
    res.status(200).json({ ok: true, places: [] });
  },
});

const QuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
});

const MAX_RESULTS = 6;

router.get("/address-book/places/search", placesSearchLimiter, (req, res) => {
  try {
    const parsed = QuerySchema.safeParse({
      q: typeof req.query.q === "string" ? req.query.q : "",
      country:
        typeof req.query.country === "string" && req.query.country.trim() !== ""
          ? req.query.country
          : undefined,
    });
    if (!parsed.success) {
      // Invalid/too-short queries are a normal part of typing — empty list,
      // never an error.
      res.status(200).json({ ok: true, places: [] });
      return;
    }
    const places = searchAddressBookPlaces(
      parsed.data.q,
      parsed.data.country,
      MAX_RESULTS,
    );
    res.status(200).json({ ok: true, places });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[addressBookPlaces] search route failed; returning empty list",
    );
    res.status(200).json({ ok: true, places: [] });
  }
});

export default router;
