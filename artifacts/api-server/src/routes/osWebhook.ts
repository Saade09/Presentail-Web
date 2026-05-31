/**
 * Presentail OS integration endpoints.
 *
 * POST /api/os/webhook
 *   Receives the delivery locations payload pushed by Presentail OS whenever
 *   cities or country settings change (and on "Send test ping").
 *
 *   OS pushes the full payload body — we parse it and store it directly.
 *   If the body is absent or empty (pure ping), we fall back to triggering
 *   a fresh pull from the OS API.
 *
 *   Authentication: the shared secret (PRESENTAIL_OS_WEBHOOK_SECRET) is
 *   checked against either the `x-os-webhook-secret` request header OR
 *   the `secret` query-string parameter — whichever is present.  The
 *   query-param form is used when the OS admin only allows you to enter a
 *   plain URL (e.g. https://your-domain.com/api/os/webhook?secret=xxx).
 *
 *   If PRESENTAIL_OS_WEBHOOK_SECRET is not configured the endpoint is
 *   disabled (returns 503) so it is never an open unauthenticated trigger.
 *
 * POST /api/os/sync/locations
 *   Admin-triggered cache refresh. Gated by PUSH_ADMIN_TOKEN in the
 *   `x-push-admin-token` header (same pattern as /api/woo/sync/run).
 */

import { Router, type IRouter } from "express";
import type { OSLocationsResponse } from "@workspace/presentail-os";
import {
  storeLocationsFromWebhook,
  invalidateOsLocationsCache,
} from "../lib/osLocationsCache";
import { invalidateOsProductsCache } from "../lib/osProductsCache";

const router: IRouter = Router();

router.post("/os/webhook", (req, res) => {
  const secret = process.env.PRESENTAIL_OS_WEBHOOK_SECRET ?? "";

  if (!secret) {
    req.log.warn(
      "osWebhook: PRESENTAIL_OS_WEBHOOK_SECRET is not configured — rejecting webhook",
    );
    return res.status(503).json({ ok: false, message: "Webhook secret not configured" }); // i18n-ignore
  }

  // Accept secret from header or query param (OS only supports plain URLs).
  const fromHeader = req.headers["x-os-webhook-secret"] ?? "";
  const fromQuery = typeof req.query["secret"] === "string" ? req.query["secret"] : "";
  const provided = fromHeader || fromQuery;

  if (provided !== secret) {
    return res.status(401).json({ ok: false, message: "Invalid webhook secret" }); // i18n-ignore
  }

  const body = req.body as OSLocationsResponse | undefined;

  if (body && Array.isArray(body.countries) && body.countries.length > 0) {
    // OS pushed a full locations payload — store it directly without a round-trip poll.
    storeLocationsFromWebhook(body);
    req.log.info(
      { countryCount: body.countries.length },
      "osWebhook: locations stored from OS push",
    );
  } else {
    // Empty body or ping-only notification — trigger a fresh pull for both
    // locations and products.
    invalidateOsLocationsCache();
    req.log.info("osWebhook: empty body — cache invalidated, fresh fetch queued");
  }

  // Always invalidate the products cache on any webhook call — product changes
  // in OS emit the same webhook as location changes (or a standalone ping).
  invalidateOsProductsCache();
  req.log.info("osWebhook: products cache invalidated");

  return res.json({ ok: true });
});

router.post("/os/sync/products", (req, res) => {
  const adminToken = process.env.PUSH_ADMIN_TOKEN ?? "";
  const provided = req.headers["x-push-admin-token"] ?? "";

  if (!adminToken) {
    return res.status(503).json({ ok: false, message: "Admin token not configured" }); // i18n-ignore
  }

  if (provided !== adminToken) {
    return res.status(401).json({ ok: false, message: "Unauthorized" }); // i18n-ignore
  }

  invalidateOsProductsCache();
  req.log.info("osWebhook: products cache invalidated via manual sync trigger");
  return res.json({ ok: true, message: "Products cache invalidated — fresh fetch queued" }); // i18n-ignore
});

router.post("/os/sync/locations", (req, res) => {
  const adminToken = process.env.PUSH_ADMIN_TOKEN ?? "";
  const provided = req.headers["x-push-admin-token"] ?? "";

  if (!adminToken) {
    return res.status(503).json({ ok: false, message: "Admin token not configured" }); // i18n-ignore
  }

  if (provided !== adminToken) {
    return res.status(401).json({ ok: false, message: "Unauthorized" }); // i18n-ignore
  }

  invalidateOsLocationsCache();
  req.log.info("osWebhook: cache invalidated via manual sync trigger");
  return res.json({ ok: true, message: "Cache invalidated — fresh fetch queued" }); // i18n-ignore
});

export default router;
