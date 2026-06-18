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
 */

import { Router, type IRouter } from "express";
import { addSseClient, removeSseClient } from "../lib/sseBroadcast";

const router: IRouter = Router();

const KEEPALIVE_MS = 15_000;

router.get("/events", (req, res) => {
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

  addSseClient(res);

  const keepalive = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      // Ignore — close handler will clean up.
    }
  }, KEEPALIVE_MS);

  req.on("close", () => {
    clearInterval(keepalive);
    removeSseClient(res);
  });
});

export default router;
