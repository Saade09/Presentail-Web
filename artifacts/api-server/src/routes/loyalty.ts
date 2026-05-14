import { Router, type IRouter } from "express";
import { authenticate } from "../lib/auth";
import { requireUserType } from "../lib/requireUserType";
import { getCustomerById, getCustomerByWcId } from "../lib/customers";
import {
  creditDeliveredOrder,
  getLoyaltyHistory,
  getLoyaltySummary,
} from "../lib/loyalty";

const router: IRouter = Router();

// GET /api/loyalty/me — signed-in customer's loyalty summary.
router.get("/loyalty/me", requireUserType(["customer"]), async (req, res) => {
  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }
  const customer = await getCustomerByWcId(auth.customerId);
  if (!customer) {
    // No local row yet (e.g. brand-new sign-in before any order). Return an
    // empty summary so the client can render the explainer instead of an
    // error.
    const empty = await getLoyaltySummary(-1).catch(() => ({
      points: 0,
      tier: { key: "new", label: "New", threshold: 0, discountPercent: 0 },
      nextTier: { key: "regular", label: "Regular", threshold: 300, discountPercent: 10 },
      pointsToNext: 300,
      coupons: [],
    }));
    res.json({ ok: true, loyalty: empty });
    return;
  }

  const summary = await getLoyaltySummary(customer.id);
  res.json({ ok: true, loyalty: summary });
});

// GET /api/admin/loyalty/:customerId — operator support view.
router.get("/admin/loyalty/:customerId", async (req, res) => {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const provided = req.header("x-push-admin-token");
  if (!expected || !provided || provided !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" });
    return;
  }
  const id = Number.parseInt(String(req.params.customerId ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "Invalid customerId" });
    return;
  }
  const customer = await getCustomerById(id);
  if (!customer) {
    res.status(404).json({ ok: false, message: "Customer not found" });
    return;
  }
  const history = await getLoyaltyHistory(id);
  res.json({ ok: true, customerId: id, ...history });
});

// POST /api/admin/loyalty/credit-order — admin-only, idempotent. Used by the
// `backfillLoyalty` script to retroactively credit historical delivered
// orders. Safe to call repeatedly: the underlying ledger insert is gated by
// a `(customerId, source, reason)` unique constraint.
router.post("/admin/loyalty/credit-order", async (req, res) => {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const provided = req.header("x-push-admin-token");
  if (!expected || !provided || provided !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" });
    return;
  }
  const body = (req.body ?? {}) as {
    customerId?: unknown;
    wcOrderId?: unknown;
    totalUsdCents?: unknown;
    storeKey?: unknown;
  };
  const customerId = Number(body.customerId);
  const wcOrderId = Number(body.wcOrderId);
  const totalUsdCents = Number(body.totalUsdCents);
  const storeKey =
    typeof body.storeKey === "string" ? body.storeKey.toLowerCase() : null;
  if (
    !Number.isFinite(customerId) || customerId <= 0 ||
    !Number.isFinite(wcOrderId) || wcOrderId <= 0 ||
    !Number.isFinite(totalUsdCents) || totalUsdCents < 0
  ) {
    res.status(400).json({ ok: false, message: "Invalid payload" });
    return;
  }
  const customer = await getCustomerById(customerId);
  if (!customer) {
    res.status(404).json({ ok: false, message: "Customer not found" });
    return;
  }
  const result = await creditDeliveredOrder({
    customerId,
    wcOrderId,
    totalUsdCents,
    storeKey,
    log: req.log,
  });
  res.json({ ok: true, ...result });
});

export default router;
