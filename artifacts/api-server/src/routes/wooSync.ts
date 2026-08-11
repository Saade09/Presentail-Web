import { Router, type IRouter } from "express";
import { runWooSyncOnce } from "../lib/wooSync";
import { logger } from "../lib/logger";
import { checkAdminToken } from "../lib/admin-auth";

const router: IRouter = Router();

// Manual "run now" trigger for the scheduled WooCommerce sync. Protected
// by the same PUSH_ADMIN_TOKEN used by the order-event push endpoint.
// Returns immediately; the sync runs in the background and its result is
// observable in the server logs.
router.post("/woo/sync/run", (req, res) => {
  if (!checkAdminToken(req, res)) return;
  // Allow ?push=0 to suppress silent pushes for this run (useful when an
  // operator just wants to warm caches without notifying every device).
  const suppressPush = req.query.push === "0" || req.query.push === "false";
  void runWooSyncOnce({ pushOnChange: !suppressPush }).catch((err) => {
    logger.warn({ err: err?.message }, "wooSync: manual run failed");
  });
  res.json({ ok: true });
});

export default router;
