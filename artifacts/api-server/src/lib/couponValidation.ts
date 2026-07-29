import { db, couponsTable, couponRedemptionsTable, appOrdersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { validateOsCoupon } from "@workspace/presentail-os";

/**
 * Reserved code for the campaign-landing first-order promotion.
 * It is applied automatically for eligible (first-order) shoppers — never
 * entered manually — and is validated locally against app_orders instead of
 * being delegated to Presentail OS.
 */
export const FIRST_ORDER_COUPON_CODE = "FIRST10";
/** Sentinel couponId marking the virtual first-order coupon (not an OS coupon). */
export const FIRST_ORDER_COUPON_ID = "first-order-10";
const FIRST_ORDER_DISCOUNT_PCT = 10;

/**
 * True when the shopper (by billing email) has no prior order on record.
 * Emails are matched case-insensitively against app_orders.sender_email.
 * Orders in payment_failed state don't count as a completed first order.
 */
export async function isFirstOrderEligible(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const rows = await db
    .select({ id: appOrdersTable.appOrderId })
    .from(appOrdersTable)
    .where(
      sql`lower(${appOrdersTable.senderEmail}) = ${normalized} and coalesce(${appOrdersTable.state}, '') <> 'payment_failed'`,
    )
    .limit(1);
  return rows.length === 0;
}

export type CartItemForCoupon = {
  osSlug: string;
  priceUsd: number;
  quantity: number;
};

export type CouponValidResult = {
  valid: true;
  couponId: string | number;
  discountType: string;
  discountValue: number;
  discountAmountUsd: number;
  finalTotalUsd: number;
};

export type CouponInvalidResult = {
  valid: false;
  error: string;
  message: string;
};

export type CouponValidateResult = CouponValidResult | CouponInvalidResult;

/**
 * Validate a coupon code against Presentail OS.
 * Returns a `CouponValidResult` on success or `CouponInvalidResult` on failure.
 */
export async function validateCoupon(
  code: string,
  {
    customerEmail,
    cartItems,
    cartTotalUsd,
  }: {
    customerEmail: string;
    cartItems: CartItemForCoupon[];
    cartTotalUsd: number;
  },
): Promise<CouponValidateResult> {
  // ── Virtual first-order coupon (campaign landing "10% off first order") ──
  // Handled locally: eligibility = no prior app_orders row for this email.
  if (code.trim().toUpperCase() === FIRST_ORDER_COUPON_CODE) {
    const email = (customerEmail ?? "").trim();
    if (!email) {
      return {
        valid: false,
        error: "email_required", // i18n-ignore
        message: "Enter your email to apply the first-order discount.", // i18n-ignore
      };
    }
    const eligible = await isFirstOrderEligible(email).catch(() => false);
    if (!eligible) {
      return {
        valid: false,
        error: "not_first_order", // i18n-ignore
        message: "This offer is only valid on your first order.", // i18n-ignore
      };
    }
    const discountAmountUsd =
      Math.round(cartTotalUsd * (FIRST_ORDER_DISCOUNT_PCT / 100) * 100) / 100;
    return {
      valid: true,
      couponId: FIRST_ORDER_COUPON_ID,
      discountType: "percent",
      discountValue: FIRST_ORDER_DISCOUNT_PCT,
      discountAmountUsd,
      finalTotalUsd: Math.max(0, Math.round((cartTotalUsd - discountAmountUsd) * 100) / 100),
    };
  }

  const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
  const baseUrl =
    process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com";

  if (!apiKey) {
    return {
      valid: false,
      error: "not_configured", // i18n-ignore
      message: "Coupon validation is not available.", // i18n-ignore
    };
  }

  try {
    return await validateOsCoupon(
      { apiKey, baseUrl },
      code,
      cartItems,
      cartTotalUsd,
    );
  } catch {
    return {
      valid: false,
      error: "os_error", // i18n-ignore
      message: "Could not validate coupon. Please try again.", // i18n-ignore
    };
  }
}

export async function redeemCoupon({
  couponId,
  customerEmail,
  orderId,
  discountAmountUsd,
}: {
  couponId: number;
  customerEmail: string;
  orderId: string;
  discountAmountUsd: number;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(couponsTable)
      .set({ usageCount: sql`${couponsTable.usageCount} + 1` })
      .where(eq(couponsTable.id, couponId));

    await tx.insert(couponRedemptionsTable).values({
      couponId,
      customerEmail,
      orderId,
      discountAmountUsd: String(discountAmountUsd),
    });
  });
}

