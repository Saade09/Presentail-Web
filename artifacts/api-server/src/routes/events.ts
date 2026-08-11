/**
 * GET /api/events
 *
 * Server-Sent Events stream.  Clients subscribe once and receive push
 * notifications when server-side data changes, eliminating the need to
 * wait for the periodic React Query poll interval.
 *
 * Current event types:
 *   locations-updated   Delivery config changed (city active state,
 *                       express flag, time slots, fees).  Clients should
 *                       refetch /api/delivery-locations immediately.
 *
 * A keepalive comment is written immediately on connect and then every 15 s
 * to prevent idle proxies from closing the connection before the first frame
 * arrives.  The client implements exponential-backoff reconnect on error.
 *
 * DoS mitigations:
 *   - sseConnectIpLimiter: max 30 new connection attempts per IP per minute
 *     (keyed on real client IP via XFF-aware sseClientIpKey, not req.ip).
 *   - addSseClient: enforces a per-IP concurrent connection cap of 10; returns
 *     false and the handler rejects with 429 when the cap is exceeded.
 *   Both defences use the same canonical IP key so caps apply per real client,
 *   not per shared proxy hop.
 */

import { Router, type IRouter } from "express";
import { addSseClient, removeSseClient } from "../lib/sseBroadcast";
import { sseClientIpKey, sseConnectIpLimiter } from "../lib/auth-rate-limit";

const router: IRouter = Router();

const KEEPALIVE_MS = 15_000;

router.get("/events", sseConnectIpLimiter, (req, res) => {
  // Derive the real client IP using the same XFF-aware strategy as the rate
  // limiter so both defences key on the same canonical address.
  const ip = sseClientIpKey(req);

  // Enforce the per-IP concurrent connection cap BEFORE setting any SSE
  // headers so we can still respond with a clean JSON 429 when the cap is
  // exceeded (setting text/event-stream first would interfere with the JSON
  // response body).
  if (!addSseClient(res, ip)) {
    res.status(429).json({
      ok: false,
      code: "too_many_connections",
      message: "Too many concurrent SSE connections from this IP.", // i18n-ignore
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Disable nginx / proxy buffering so frames reach the client instantly.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send an immediate keepalive so production proxies receive response bytes
  // right away and do not close the connection waiting for the first chunk.
  try {
    res.write(": keepalive\n\n");
  } catch {
    // Client already gone.
  }

  const keepalive = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      // Ignore — close handler will clean up.
    }
  }, KEEPALIVE_MS);

  req.on("close", () => {
    clearInterval(keepalive);
    removeSseClient(res, ip);
  });
});

export default router;
