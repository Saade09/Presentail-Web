import { db, couponsTable, couponRedemptionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { validateOsCoupon } from "@workspace/presentail-os";

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
    customerEmail: _customerEmail,
    cartItems,
    cartTotalUsd,
  }: {
    customerEmail: string;
    cartItems: CartItemForCoupon[];
    cartTotalUsd: number;
  },
): Promise<CouponValidateResult> {
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

