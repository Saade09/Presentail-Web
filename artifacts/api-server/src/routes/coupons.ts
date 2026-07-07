import { Router, type Request, type Response, type NextFunction } from "express";
import { db, couponsTable, couponRedemptionsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { validateCoupon, redeemCoupon, type CartItemForCoupon } from "../lib/couponValidation";
import { fetchOsCoupons } from "@workspace/presentail-os";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const provided =
    req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !provided || provided !== expected) {
    res.status(401).json({ ok: false, message: "Unauthorized" }); // i18n-ignore
    return;
  }
  next();
}

// ── Public: list available OS coupons ───────────────────────────────────────

router.get("/coupons", async (_req, res) => {
  const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
  const baseUrl =
    process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com";
  if (!apiKey) {
    return res.status(503).json({ ok: false, coupons: [] });
  }
  try {
    const coupons = await fetchOsCoupons({ apiKey, baseUrl });
    return res.json({ ok: true, coupons });
  } catch {
    return res.status(502).json({ ok: false, coupons: [] });
  }
});

// ── Public: validate a coupon code ──────────────────────────────────────────

type ValidateBody = {
  code: string;
  customerEmail?: string;
  cartItems: { osSlug: string; priceUsd: number; quantity: number }[];
  cartTotalUsd: number;
};

router.post("/coupons/validate", async (req, res) => {
  const body = req.body as ValidateBody;
  const code = (body.code ?? "").trim();
  const customerEmail = (body.customerEmail ?? "").trim();
  const cartItems: CartItemForCoupon[] = Array.isArray(body.cartItems) ? body.cartItems : [];
  const cartTotalUsd = Number(body.cartTotalUsd);

  if (!code) {
    return res.status(400).json({ ok: false, error: "missing_code", message: "Coupon code is required." }); // i18n-ignore
  }
  if (!Array.isArray(body.cartItems) || cartItems.length === 0) {
    return res.status(400).json({ ok: false, error: "missing_items", message: "Cart items are required." }); // i18n-ignore
  }
  if (!Number.isFinite(cartTotalUsd) || cartTotalUsd <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_total", message: "Invalid cart total." }); // i18n-ignore
  }

  const result = await validateCoupon(code, {
    customerEmail,
    cartItems,
    cartTotalUsd,
  });

  if (!result.valid) {
    return res.status(422).json({ ok: false, ...result });
  }

  return res.json({
    ok: true,
    discountType: result.discountType,
    discountValue: result.discountValue,
    discountAmountUsd: result.discountAmountUsd,
    finalTotalUsd: result.finalTotalUsd,
  });
});

// ── Internal: redeem a coupon after a successful order ───────────────────────

type RedeemBody = {
  code: string;
  customerEmail: string;
  orderId: string;
  discountAmountUsd: number;
};

router.post("/coupons/redeem", requireAdmin, async (req, res) => {
  const body = req.body as RedeemBody;
  const code = (body.code ?? "").trim();
  const customerEmail = (body.customerEmail ?? "").trim();
  const orderId = (body.orderId ?? "").trim();
  const discountAmountUsd = Number(body.discountAmountUsd);

  if (!code || !customerEmail || !orderId) {
    return res.status(400).json({ ok: false, message: "code, customerEmail, and orderId are required." }); // i18n-ignore
  }

  const rows = await db
    .select({ id: couponsTable.id })
    .from(couponsTable)
    .where(eq(sql`lower(${couponsTable.code})`, code.toLowerCase()))
    .limit(1);

  const coupon = rows[0];
  if (!coupon) {
    return res.status(404).json({ ok: false, message: "Coupon not found." }); // i18n-ignore
  }

  await redeemCoupon({ couponId: coupon.id, customerEmail, orderId, discountAmountUsd });
  return res.json({ ok: true });
});

// ── Admin: list coupons ──────────────────────────────────────────────────────

router.get("/admin/coupons", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(couponsTable)
    .orderBy(desc(couponsTable.createdAt));
  return res.json({ ok: true, coupons: rows });
});

// ── Admin: create coupon ─────────────────────────────────────────────────────

type CreateCouponBody = {
  code: string;
  description?: string;
  discountType: "percentage" | "fixed_cart";
  discountValue: number;
  minOrderUsd?: number;
  usageLimit?: number;
  usageLimitPerUser?: number;
  includedProductSlugs?: string[];
  excludedProductSlugs?: string[];
  includedCategoryIds?: string[];
  excludedCategoryIds?: string[];
  startsAt?: string;
  expiresAt?: string;
  active?: boolean;
};

router.post("/admin/coupons", requireAdmin, async (req, res) => {
  const body = req.body as CreateCouponBody;

  if (!body.code?.trim()) {
    return res.status(400).json({ ok: false, message: "code is required." }); // i18n-ignore
  }
  if (!["percentage", "fixed_cart"].includes(body.discountType)) {
    return res.status(400).json({ ok: false, message: "discountType must be percentage or fixed_cart." }); // i18n-ignore
  }
  if (!Number.isFinite(Number(body.discountValue)) || Number(body.discountValue) <= 0) {
    return res.status(400).json({ ok: false, message: "discountValue must be a positive number." }); // i18n-ignore
  }
  if (body.discountType === "percentage" && Number(body.discountValue) > 100) {
    return res.status(400).json({ ok: false, message: "Percentage discount cannot exceed 100." }); // i18n-ignore
  }

  const [created] = await db.insert(couponsTable).values({
    code: body.code.trim().toUpperCase(),
    description: body.description ?? null,
    discountType: body.discountType,
    discountValue: String(body.discountValue),
    minOrderUsd: body.minOrderUsd != null ? String(body.minOrderUsd) : null,
    usageLimit: body.usageLimit ?? null,
    usageLimitPerUser: body.usageLimitPerUser ?? null,
    includedProductSlugs: body.includedProductSlugs ?? null,
    excludedProductSlugs: body.excludedProductSlugs ?? null,
    includedCategoryIds: body.includedCategoryIds ?? null,
    excludedCategoryIds: body.excludedCategoryIds ?? null,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    active: body.active ?? true,
  }).returning();

  return res.status(201).json({ ok: true, coupon: created });
});

// ── Admin: update coupon ─────────────────────────────────────────────────────

router.patch("/admin/coupons/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: "Invalid coupon id." }); // i18n-ignore
  }

  const body = req.body as Partial<CreateCouponBody>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.code != null) updates.code = body.code.trim().toUpperCase();
  if (body.description != null) updates.description = body.description;
  if (body.discountType != null) updates.discountType = body.discountType;
  if (body.discountValue != null) updates.discountValue = String(body.discountValue);
  if (body.minOrderUsd != null) updates.minOrderUsd = String(body.minOrderUsd);
  if (body.usageLimit != null) updates.usageLimit = body.usageLimit;
  if (body.usageLimitPerUser != null) updates.usageLimitPerUser = body.usageLimitPerUser;
  if (body.includedProductSlugs != null) updates.includedProductSlugs = body.includedProductSlugs;
  if (body.excludedProductSlugs != null) updates.excludedProductSlugs = body.excludedProductSlugs;
  if (body.includedCategoryIds != null) updates.includedCategoryIds = body.includedCategoryIds;
  if (body.excludedCategoryIds != null) updates.excludedCategoryIds = body.excludedCategoryIds;
  if (body.startsAt != null) updates.startsAt = new Date(body.startsAt);
  if (body.expiresAt != null) updates.expiresAt = new Date(body.expiresAt);
  if (body.active != null) updates.active = body.active;

  const [updated] = await db
    .update(couponsTable)
    .set(updates)
    .where(eq(couponsTable.id, id))
    .returning();

  if (!updated) {
    return res.status(404).json({ ok: false, message: "Coupon not found." }); // i18n-ignore
  }

  return res.json({ ok: true, coupon: updated });
});

// ── Admin: delete coupon ─────────────────────────────────────────────────────

router.delete("/admin/coupons/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: "Invalid coupon id." }); // i18n-ignore
  }

  const [deleted] = await db
    .delete(couponsTable)
    .where(eq(couponsTable.id, id))
    .returning({ id: couponsTable.id });

  if (!deleted) {
    return res.status(404).json({ ok: false, message: "Coupon not found." }); // i18n-ignore
  }

  return res.json({ ok: true });
});

// ── Admin: redemption history for a coupon ───────────────────────────────────

router.get("/admin/coupons/:id/redemptions", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: "Invalid coupon id." }); // i18n-ignore
  }

  const rows = await db
    .select()
    .from(couponRedemptionsTable)
    .where(eq(couponRedemptionsTable.couponId, id))
    .orderBy(desc(couponRedemptionsTable.createdAt));

  return res.json({ ok: true, redemptions: rows });
});

export default router;
