import { db, couponsTable, couponRedemptionsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { getOsProductBySlug } from "./osProductsCache";

export type CartItemForCoupon = {
  osSlug: string;
  priceUsd: number;
  quantity: number;
};

export type CouponValidResult = {
  valid: true;
  couponId: number;
  discountType: "percentage" | "fixed_cart";
  discountValue: number;
  discountAmountUsd: number;
  finalTotalUsd: number;
};

export type CouponInvalidResult = {
  valid: false;
  error:
    | "not_found"
    | "inactive"
    | "not_started_yet"
    | "expired"
    | "usage_limit_reached"
    | "usage_limit_per_user_reached"
    | "below_minimum"
    | "no_eligible_items";
  message: string;
};

export type CouponValidateResult = CouponValidResult | CouponInvalidResult;

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
  const rows = await db
    .select()
    .from(couponsTable)
    .where(eq(sql`lower(${couponsTable.code})`, code.trim().toLowerCase()))
    .limit(1);

  const coupon = rows[0];

  if (!coupon) {
    return { valid: false, error: "not_found", message: "Coupon code not found." }; // i18n-ignore
  }
  if (!coupon.active) {
    return { valid: false, error: "inactive", message: "This coupon is no longer active." }; // i18n-ignore
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    return { valid: false, error: "not_started_yet", message: "This coupon is not yet valid." }; // i18n-ignore
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    return { valid: false, error: "expired", message: "This coupon has expired." }; // i18n-ignore
  }

  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, error: "usage_limit_reached", message: "This coupon has reached its usage limit." }; // i18n-ignore
  }

  if (coupon.usageLimitPerUser !== null) {
    const userUses = await db
      .select({ count: sql<number>`count(*)` })
      .from(couponRedemptionsTable)
      .where(
        and(
          eq(couponRedemptionsTable.couponId, coupon.id),
          eq(sql`lower(${couponRedemptionsTable.customerEmail})`, customerEmail.toLowerCase()),
        ),
      );
    if ((userUses[0]?.count ?? 0) >= coupon.usageLimitPerUser) {
      return { valid: false, error: "usage_limit_per_user_reached", message: "You have already used this coupon." }; // i18n-ignore
    }
  }

  // Determine eligible cart items based on product/category scope
  let eligibleItems = cartItems;

  const hasProductScope =
    (coupon.includedProductSlugs && coupon.includedProductSlugs.length > 0) ||
    (coupon.excludedProductSlugs && coupon.excludedProductSlugs.length > 0) ||
    (coupon.includedCategoryIds && coupon.includedCategoryIds.length > 0) ||
    (coupon.excludedCategoryIds && coupon.excludedCategoryIds.length > 0);

  if (hasProductScope) {
    eligibleItems = cartItems.filter((item) => {
      const osProduct = getOsProductBySlug(item.osSlug);

      if (coupon.includedProductSlugs && coupon.includedProductSlugs.length > 0) {
        if (!coupon.includedProductSlugs.includes(item.osSlug)) return false;
      }
      if (coupon.excludedProductSlugs && coupon.excludedProductSlugs.length > 0) {
        if (coupon.excludedProductSlugs.includes(item.osSlug)) return false;
      }

      if (osProduct) {
        const productCategoryIds = osProduct.categories.map((c) => c.id);
        if (coupon.includedCategoryIds && coupon.includedCategoryIds.length > 0) {
          if (!productCategoryIds.some((cid) => coupon.includedCategoryIds!.includes(cid))) return false;
        }
        if (coupon.excludedCategoryIds && coupon.excludedCategoryIds.length > 0) {
          if (productCategoryIds.some((cid) => coupon.excludedCategoryIds!.includes(cid))) return false;
        }
      }

      return true;
    });

    if (eligibleItems.length === 0) {
      return { valid: false, error: "no_eligible_items", message: "This coupon does not apply to any items in your cart." }; // i18n-ignore
    }
  }

  const eligibleSubtotalUsd = eligibleItems.reduce(
    (sum, i) => sum + i.priceUsd * i.quantity,
    0,
  );

  if (coupon.minOrderUsd !== null) {
    const minOrder = parseFloat(coupon.minOrderUsd);
    if (cartTotalUsd < minOrder) {
      return {
        valid: false,
        error: "below_minimum",
        message: `Minimum order of $${minOrder.toFixed(2)} required for this coupon.`, // i18n-ignore
      };
    }
  }

  const discountType = coupon.discountType as "percentage" | "fixed_cart";
  const discountValue = parseFloat(coupon.discountValue);

  let discountAmountUsd: number;
  if (discountType === "percentage") {
    discountAmountUsd = (eligibleSubtotalUsd * discountValue) / 100;
  } else {
    discountAmountUsd = Math.min(discountValue, eligibleSubtotalUsd);
  }

  discountAmountUsd = Math.round(discountAmountUsd * 100) / 100;
  const finalTotalUsd = Math.max(0, cartTotalUsd - discountAmountUsd);

  return {
    valid: true,
    couponId: coupon.id,
    discountType,
    discountValue,
    discountAmountUsd,
    finalTotalUsd,
  };
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
