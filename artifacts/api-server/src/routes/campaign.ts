import { Router } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";
import { authenticate } from "../lib/auth";
import { isFirstOrderEligible } from "../lib/couponValidation";

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

export default router;
