import { and, asc, desc, eq, lt, or, sum, isNull } from "drizzle-orm";
import {
  db,
  loyaltyLedgerTable,
  loyaltyCouponsTable,
  type LoyaltyCouponRow,
} from "@workspace/db";
import { logger } from "./logger";
import {
  resolveStoreByKey,
  wooAuthHeader,
  type StoreKey,
  type WooStoreConfig,
} from "./wooStore";
import { getCustomerById } from "./customers";
import { sendLoyaltyUnlockPush } from "./loyaltyPush";

// ── Tier table ──────────────────────────────────────────────────────────────
//
//   - Earn 1 point per $1 spent (USD totals on the wire).
//   - New     :   0 pts (just getting started)
//   - Regular : 300 pts → 10% off coupon
//   - Loyal   : 600 pts → 15% off coupon
//   - VIP     : 1000 pts → 20% off coupon

export type LoyaltyTierKey = "new" | "regular" | "loyal" | "vip";

export type LoyaltyTier = {
  key: LoyaltyTierKey;
  label: string;
  threshold: number;
  discountPercent: number;
};

export const LOYALTY_TIERS: readonly LoyaltyTier[] = [
  { key: "new", label: "New", threshold: 0, discountPercent: 0 },
  { key: "regular", label: "Regular", threshold: 300, discountPercent: 10 },
  { key: "loyal", label: "Loyal", threshold: 600, discountPercent: 15 },
  { key: "vip", label: "VIP", threshold: 1000, discountPercent: 20 },
] as const;

export const TIERS_WITH_COUPON = LOYALTY_TIERS.filter(
  (t) => t.discountPercent > 0,
);

export type LoyaltyState = {
  points: number;
  tier: LoyaltyTier;
  nextTier: LoyaltyTier | null;
  pointsToNext: number | null;
};

export function computeTierState(points: number): LoyaltyState {
  const safe = Math.max(0, Math.floor(points));
  let current: LoyaltyTier = LOYALTY_TIERS[0];
  for (const tier of LOYALTY_TIERS) {
    if (safe >= tier.threshold) current = tier;
  }
  const next = LOYALTY_TIERS.find((t) => t.threshold > safe) ?? null;
  return {
    points: safe,
    tier: current,
    nextTier: next,
    pointsToNext: next ? Math.max(0, next.threshold - safe) : null,
  };
}

export function unlockedCouponTiers(points: number): LoyaltyTier[] {
  const safe = Math.max(0, Math.floor(points));
  return TIERS_WITH_COUPON.filter((t) => safe >= t.threshold);
}

// 1 USD == 1 point, rounded down so a $9.99 order earns 9 points (matches
// "1 point per $1 spent" — fractional dollars don't earn points).
export function usdCentsToPoints(usdCents: number | null | undefined): number {
  return Math.max(0, Math.floor((usdCents ?? 0) / 100));
}

// ── Ledger helpers ──────────────────────────────────────────────────────────

// `${storeKey}:${wcOrderId}` — uses the canonical store key (lebanon |
// dubai | abudhabi | cyprus) so that Dubai and Abu Dhabi orders cannot
// collide on the same wcOrderId (they share country code AE).
export function orderSourceKey(
  storeKey: StoreKey | string | null | undefined,
  wcOrderId: number,
): string {
  const k = (storeKey ?? "unknown").toString().toLowerCase();
  return `${k}:${wcOrderId}`;
}

export async function getCustomerPoints(customerId: number): Promise<number> {
  const rows = await db
    .select({ total: sum(loyaltyLedgerTable.points) })
    .from(loyaltyLedgerTable)
    .where(eq(loyaltyLedgerTable.customerId, customerId));
  const raw = rows[0]?.total ?? "0";
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

async function insertLedger(input: {
  customerId: number;
  points: number;
  reason: string;
  source: string;
  wcOrderId?: number | null;
  storeKey?: string | null;
  note?: string | null;
}): Promise<boolean> {
  if (!input.points) return false;
  try {
    const result = await db
      .insert(loyaltyLedgerTable)
      .values({
        customerId: input.customerId,
        points: input.points,
        reason: input.reason,
        source: input.source,
        wcOrderId: input.wcOrderId ?? null,
        storeKey: input.storeKey ?? null,
        note: input.note ?? null,
      })
      .onConflictDoNothing({
        target: [
          loyaltyLedgerTable.customerId,
          loyaltyLedgerTable.source,
          loyaltyLedgerTable.reason,
        ],
      })
      .returning({ id: loyaltyLedgerTable.id });
    return result.length > 0;
  } catch (err: any) {
    logger.warn(
      { err: err?.message, ...input },
      "loyalty: insertLedger failed",
    );
    return false;
  }
}

// ── Coupon engine ───────────────────────────────────────────────────────────

async function wcFetch(
  store: WooStoreConfig,
  path: string,
  options: RequestInit = {},
) {
  return fetch(`${store.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: wooAuthHeader(store),
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailApp/1.0",
      ...(options.headers ?? {}),
    },
  });
}

function newCouponCode(tier: LoyaltyTier, customerId: number): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PRSNT-${tier.key.toUpperCase()}-${customerId}-${rand}`;
}

async function createWcCoupon(
  store: WooStoreConfig,
  email: string,
  tier: LoyaltyTier,
  code: string,
  log?: { warn?: (...args: any[]) => void },
): Promise<{ wcCouponId: number | null }> {
  if (!store.consumerKey) {
    return { wcCouponId: null };
  }
  try {
    const r = await wcFetch(store, "/coupons", {
      method: "POST",
      body: JSON.stringify({
        code,
        discount_type: "percent",
        amount: String(tier.discountPercent),
        individual_use: true,
        usage_limit: 1,
        usage_limit_per_user: 1,
        email_restrictions: [email],
        description: `Presentail loyalty ${tier.label} tier reward`, // i18n-ignore
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      log?.warn?.(
        { status: r.status, body: body.slice(0, 200), code },
        "loyalty: WC coupon create failed",
      );
      return { wcCouponId: null };
    }
    const data = (await r.json().catch(() => ({}))) as { id?: number };
    return { wcCouponId: typeof data?.id === "number" ? data.id : null };
  } catch (err: any) {
    log?.warn?.({ err: err?.message, code }, "loyalty: WC coupon create error");
    return { wcCouponId: null };
  }
}

// Mint a tier coupon for the customer if they don't already have an active
// one for that tier. Returns the issued coupon row (active) when something
// was minted; returns null when there was already an active coupon for the
// tier (no-op).
export async function ensureTierCoupon(input: {
  customerId: number;
  email: string;
  tier: LoyaltyTier;
  store: WooStoreConfig;
  log?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void };
}): Promise<LoyaltyCouponRow | null> {
  const { customerId, email, tier, store, log } = input;

  const existing = await db
    .select()
    .from(loyaltyCouponsTable)
    .where(
      and(
        eq(loyaltyCouponsTable.customerId, customerId),
        eq(loyaltyCouponsTable.tier, tier.key),
        eq(loyaltyCouponsTable.status, "active"),
      ),
    )
    .limit(1);
  if (existing[0]) return null;

  const code = newCouponCode(tier, customerId);
  const { wcCouponId } = await createWcCoupon(store, email, tier, code, log);

  // Refuse to persist an "active" coupon row without a real WC coupon
  // behind it — otherwise the customer sees a code they cannot redeem.
  // The next loyalty/me read (or order delivery) will retry the mint.
  if (wcCouponId == null) {
    log?.warn?.(
      { customerId, tier: tier.key, storeKey: store.storeKey },
      "loyalty: skipping coupon row insert — WC mint did not return an id",
    );
    return null;
  }

  try {
    const [row] = await db
      .insert(loyaltyCouponsTable)
      .values({
        customerId,
        tier: tier.key,
        discountPercent: tier.discountPercent,
        wcCouponId,
        code,
        storeKey: store.storeKey,
        status: "active",
      })
      .returning();
    log?.info?.(
      { customerId, tier: tier.key, wcCouponId, code, storeKey: store.storeKey },
      "loyalty: minted tier coupon",
    );
    return row;
  } catch (err: any) {
    if (err?.code === "23505") {
      const [row] = await db
        .select()
        .from(loyaltyCouponsTable)
        .where(
          and(
            eq(loyaltyCouponsTable.customerId, customerId),
            eq(loyaltyCouponsTable.tier, tier.key),
            eq(loyaltyCouponsTable.status, "active"),
          ),
        )
        .limit(1);
      return row ?? null;
    }
    log?.warn?.(
      { err: err?.message, customerId, tier: tier.key },
      "loyalty: failed to persist coupon row",
    );
    return null;
  }
}

async function replaceActiveCouponsBelowTier(
  customerId: number,
  tierKey: LoyaltyTierKey,
): Promise<void> {
  const tierIndex = LOYALTY_TIERS.findIndex((t) => t.key === tierKey);
  if (tierIndex < 0) return;
  const lowerKeys = LOYALTY_TIERS.slice(0, tierIndex)
    .filter((t) => t.discountPercent > 0)
    .map((t) => t.key);
  if (!lowerKeys.length) return;
  for (const key of lowerKeys) {
    await db
      .update(loyaltyCouponsTable)
      .set({ status: "replaced", updatedAt: new Date() })
      .where(
        and(
          eq(loyaltyCouponsTable.customerId, customerId),
          eq(loyaltyCouponsTable.tier, key),
          eq(loyaltyCouponsTable.status, "active"),
        ),
      );
  }
}

// ── Coupon usage sync (handles "replaced when used") ──────────────────────
//
// Called lazily from `getLoyaltySummary`. For each active coupon row whose
// WC `usage_count` >= 1 (or that has `date_expires` in the past), mark the
// row as `used` and mint a fresh active coupon for the same tier. Throttled
// via `lastSyncedAt` so each loyalty/me read does at most one WC roundtrip
// per coupon every COUPON_SYNC_TTL_MS.

const COUPON_SYNC_TTL_MS = 5 * 60 * 1000;

async function fetchWcCouponUsage(
  store: WooStoreConfig,
  wcCouponId: number,
  log?: { warn?: (...args: any[]) => void },
): Promise<{ usageCount: number } | null> {
  if (!store.consumerKey) return null;
  try {
    const r = await wcFetch(store, `/coupons/${wcCouponId}`);
    if (r.status === 404) return { usageCount: 1 }; // deleted in WC → treat as used
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      log?.warn?.(
        { status: r.status, body: body.slice(0, 200), wcCouponId },
        "loyalty: WC coupon read failed",
      );
      return null;
    }
    const data = (await r.json().catch(() => ({}))) as {
      usage_count?: number;
    };
    const n = Number(data?.usage_count);
    return { usageCount: Number.isFinite(n) ? Math.max(0, n) : 0 };
  } catch (err: any) {
    log?.warn?.({ err: err?.message, wcCouponId }, "loyalty: WC coupon read error");
    return null;
  }
}

export type SyncCouponsResult = {
  checked: number;
  marked: number;
  minted: LoyaltyCouponRow[];
};

export async function syncActiveCouponsForCustomer(input: {
  customerId: number;
  log?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void };
}): Promise<SyncCouponsResult> {
  const { customerId, log } = input;
  const cutoff = new Date(Date.now() - COUPON_SYNC_TTL_MS);
  const stale = await db
    .select()
    .from(loyaltyCouponsTable)
    .where(
      and(
        eq(loyaltyCouponsTable.customerId, customerId),
        eq(loyaltyCouponsTable.status, "active"),
        or(
          isNull(loyaltyCouponsTable.lastSyncedAt),
          lt(loyaltyCouponsTable.lastSyncedAt, cutoff),
        ),
      ),
    );

  const result: SyncCouponsResult = { checked: 0, marked: 0, minted: [] };
  if (!stale.length) return result;

  const customer = await getCustomerById(customerId);
  if (!customer || !customer.email) return result;

  for (const row of stale) {
    if (!row.wcCouponId) {
      // Historical row with no WC counterpart (e.g. predates the
      // mint-success guard). Mark it `failed` so the active-per-tier
      // unique index frees up, then attempt to mint a fresh active
      // coupon for the same tier so the shopper isn't permanently
      // stuck on a dead row.
      await db
        .update(loyaltyCouponsTable)
        .set({
          status: "failed",
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(loyaltyCouponsTable.id, row.id));
      const tier = LOYALTY_TIERS.find((t) => t.key === row.tier) ?? null;
      if (tier && tier.discountPercent > 0) {
        const store = resolveStoreByKey(row.storeKey);
        const minted = await ensureTierCoupon({
          customerId,
          email: customer.email,
          tier,
          store,
          log,
        });
        if (minted) {
          result.minted.push(minted);
          try {
            await sendLoyaltyUnlockPush({
              userId: customerId,
              tierLabel: tier.label,
              discountPercent: tier.discountPercent,
              code: minted.code,
            });
          } catch {
            /* push best-effort */
          }
        }
      }
      continue;
    }
    const store = resolveStoreByKey(row.storeKey);
    const usage = await fetchWcCouponUsage(store, row.wcCouponId, log);
    result.checked++;
    if (!usage) {
      await db
        .update(loyaltyCouponsTable)
        .set({ lastSyncedAt: new Date() })
        .where(eq(loyaltyCouponsTable.id, row.id));
      continue;
    }
    if (usage.usageCount < 1) {
      await db
        .update(loyaltyCouponsTable)
        .set({ lastSyncedAt: new Date(), wcUsageCount: usage.usageCount })
        .where(eq(loyaltyCouponsTable.id, row.id));
      continue;
    }
    // Used — mark and mint replacement at the same tier in the same store.
    await db
      .update(loyaltyCouponsTable)
      .set({
        status: "used",
        wcUsageCount: usage.usageCount,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(loyaltyCouponsTable.id, row.id));
    result.marked++;

    const tier = LOYALTY_TIERS.find((t) => t.key === row.tier) ?? null;
    if (!tier || tier.discountPercent === 0) continue;
    const minted = await ensureTierCoupon({
      customerId,
      email: customer.email,
      tier,
      store,
      log,
    });
    if (minted) {
      result.minted.push(minted);
      // Best-effort unlock push for the replacement.
      try {
        await sendLoyaltyUnlockPush({
          userId: customerId,
          tierLabel: tier.label,
          discountPercent: tier.discountPercent,
          code: minted.code,
        });
      } catch {
        /* never throw out of the sync loop */
      }
    }
  }
  return result;
}

// ── Public engine API ──────────────────────────────────────────────────────

export type CreditOrderInput = {
  customerId: number;
  wcOrderId: number;
  totalUsdCents: number;
  storeKey?: StoreKey | string | null;
  log?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void };
};

export type CreditOrderResult = {
  credited: boolean;
  pointsAwarded: number;
  totalPoints: number;
  newCoupons: LoyaltyCouponRow[];
};

export async function creditDeliveredOrder(
  input: CreditOrderInput,
): Promise<CreditOrderResult> {
  const { customerId, wcOrderId, totalUsdCents, storeKey, log } = input;
  const points = usdCentsToPoints(totalUsdCents);
  const source = orderSourceKey(storeKey, wcOrderId);

  const before = await getCustomerPoints(customerId);
  const beforeUnlocked = unlockedCouponTiers(before).map((t) => t.key);

  const inserted = await insertLedger({
    customerId,
    points,
    reason: "order_delivered",
    source,
    wcOrderId,
    storeKey: storeKey ? String(storeKey).toLowerCase() : null,
  });

  const totalPoints = inserted ? before + points : before;
  if (!inserted || points === 0) {
    return {
      credited: inserted,
      pointsAwarded: inserted ? points : 0,
      totalPoints,
      newCoupons: [],
    };
  }

  const newlyUnlocked = unlockedCouponTiers(totalPoints).filter(
    (t) => !beforeUnlocked.includes(t.key),
  );
  if (!newlyUnlocked.length) {
    return {
      credited: true,
      pointsAwarded: points,
      totalPoints,
      newCoupons: [],
    };
  }

  const customer = await getCustomerById(customerId);
  if (!customer || !customer.email) {
    log?.warn?.(
      { customerId },
      "loyalty: cannot mint coupon — customer or email missing",
    );
    return {
      credited: true,
      pointsAwarded: points,
      totalPoints,
      newCoupons: [],
    };
  }

  const store = resolveStoreByKey(storeKey);
  const minted: LoyaltyCouponRow[] = [];
  const ordered = [...newlyUnlocked].sort(
    (a, b) => b.discountPercent - a.discountPercent,
  );
  for (const tier of ordered) {
    await replaceActiveCouponsBelowTier(customerId, tier.key);
    const row = await ensureTierCoupon({
      customerId,
      email: customer.email,
      tier,
      store,
      log,
    });
    if (row) {
      minted.push(row);
      try {
        await sendLoyaltyUnlockPush({
          userId: customerId,
          tierLabel: tier.label,
          discountPercent: tier.discountPercent,
          code: row.code,
        });
      } catch {
        /* push is best-effort */
      }
    }
  }

  return {
    credited: true,
    pointsAwarded: points,
    totalPoints,
    newCoupons: minted,
  };
}

// ── Referral redemption credit ─────────────────────────────────────────────
//
// Called fire-and-forget after a successful order that included a referral
// coupon code. Awards a configurable point bonus (REFERRAL_POINTS_AWARD, default
// 0 — inert until ops sets it) to the referrer. Uses the same ledger as the
// order-delivery path so tier unlocks and coupon minting apply automatically.
// source key: "referral:<referrerCustomerId>:<redeemingOrderSourceKey>"

export type CreditReferralInput = {
  referrerCustomerId: number;
  redeemerSourceKey: string;
  storeKey?: StoreKey | string | null;
  log?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void };
};

export async function creditReferralRedemption(
  input: CreditReferralInput,
): Promise<{ credited: boolean; pointsAwarded: number }> {
  const { referrerCustomerId, redeemerSourceKey, storeKey, log } = input;
  const rawAmount = process.env.REFERRAL_POINTS_AWARD;
  const points = rawAmount ? Math.max(0, Math.floor(Number(rawAmount))) : 0;
  if (points === 0) {
    return { credited: false, pointsAwarded: 0 };
  }
  const source = `referral:${referrerCustomerId}:${redeemerSourceKey}`;
  const inserted = await insertLedger({
    customerId: referrerCustomerId,
    points,
    reason: "referral_redeemed",
    source,
    storeKey: storeKey ? String(storeKey).toLowerCase() : null,
  });
  if (!inserted) {
    return { credited: false, pointsAwarded: 0 };
  }
  log?.info?.(
    { referrerCustomerId, points, source },
    "loyalty: awarded referral points",
  );
  // Check for newly unlocked tiers and mint coupons if applicable.
  const totalPoints = await getCustomerPoints(referrerCustomerId);
  const beforePoints = totalPoints - points;
  const beforeUnlocked = unlockedCouponTiers(beforePoints).map((t) => t.key);
  const newlyUnlocked = unlockedCouponTiers(totalPoints).filter(
    (t) => !beforeUnlocked.includes(t.key),
  );
  if (newlyUnlocked.length > 0) {
    const customer = await getCustomerById(referrerCustomerId);
    if (customer?.email) {
      const store = resolveStoreByKey(storeKey);
      const ordered = [...newlyUnlocked].sort(
        (a, b) => b.discountPercent - a.discountPercent,
      );
      for (const tier of ordered) {
        await replaceActiveCouponsBelowTier(referrerCustomerId, tier.key);
        const row = await ensureTierCoupon({
          customerId: referrerCustomerId,
          email: customer.email,
          tier,
          store,
          log,
        });
        if (row) {
          try {
            await sendLoyaltyUnlockPush({
              userId: referrerCustomerId,
              tierLabel: tier.label,
              discountPercent: tier.discountPercent,
              code: row.code,
            });
          } catch {
            /* push is best-effort */
          }
        }
      }
    }
  }
  return { credited: true, pointsAwarded: points };
}

export type ReverseOrderInput = {
  customerId: number;
  wcOrderId: number;
  storeKey?: StoreKey | string | null;
  reason?: "cancelled" | "refunded";
  log?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void };
};

export async function reverseDeliveredOrder(
  input: ReverseOrderInput,
): Promise<{ reversed: boolean; pointsReversed: number; totalPoints: number }> {
  const { customerId, wcOrderId, storeKey } = input;
  const source = orderSourceKey(storeKey, wcOrderId);

  const credit = await db
    .select()
    .from(loyaltyLedgerTable)
    .where(
      and(
        eq(loyaltyLedgerTable.customerId, customerId),
        eq(loyaltyLedgerTable.source, source),
        eq(loyaltyLedgerTable.reason, "order_delivered"),
      ),
    )
    .limit(1);
  if (!credit[0] || credit[0].points <= 0) {
    return {
      reversed: false,
      pointsReversed: 0,
      totalPoints: await getCustomerPoints(customerId),
    };
  }

  const inserted = await insertLedger({
    customerId,
    points: -credit[0].points,
    reason: "order_reversed",
    source,
    wcOrderId,
    storeKey: storeKey ? String(storeKey).toLowerCase() : null,
    note: input.reason ?? null,
  });

  const total = await getCustomerPoints(customerId);
  return {
    reversed: inserted,
    pointsReversed: inserted ? credit[0].points : 0,
    totalPoints: total,
  };
}

// ── Read API ────────────────────────────────────────────────────────────────

export type LoyaltySummary = {
  points: number;
  tier: LoyaltyTier;
  nextTier: LoyaltyTier | null;
  pointsToNext: number | null;
  coupons: {
    id: number;
    tier: LoyaltyTierKey;
    tierLabel: string;
    discountPercent: number;
    code: string;
    status: string;
    storeKey: string | null;
    createdAt: string;
  }[];
};

export async function getLoyaltySummary(
  customerId: number,
  options: { syncCoupons?: boolean; log?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void } } = {},
): Promise<LoyaltySummary> {
  if (options.syncCoupons !== false && customerId > 0) {
    try {
      await syncActiveCouponsForCustomer({ customerId, log: options.log });
    } catch (err: any) {
      // Sync is best-effort; never fail the read.
      logger.warn(
        { err: err?.message, customerId },
        "loyalty: syncActiveCouponsForCustomer failed",
      );
    }
  }
  const points = await getCustomerPoints(customerId);
  const state = computeTierState(points);
  const couponRows = await db
    .select()
    .from(loyaltyCouponsTable)
    .where(
      and(
        eq(loyaltyCouponsTable.customerId, customerId),
        eq(loyaltyCouponsTable.status, "active"),
      ),
    )
    .orderBy(desc(loyaltyCouponsTable.createdAt));
  return {
    points: state.points,
    tier: state.tier,
    nextTier: state.nextTier,
    pointsToNext: state.pointsToNext,
    coupons: couponRows.map((r) => ({
      id: r.id,
      tier: r.tier as LoyaltyTierKey,
      tierLabel:
        LOYALTY_TIERS.find((t) => t.key === r.tier)?.label ?? r.tier,
      discountPercent: r.discountPercent,
      code: r.code,
      status: r.status,
      storeKey: r.storeKey,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function getLoyaltyHistory(customerId: number): Promise<{
  summary: LoyaltySummary;
  ledger: {
    id: number;
    points: number;
    reason: string;
    source: string;
    wcOrderId: number | null;
    storeKey: string | null;
    note: string | null;
    createdAt: string;
  }[];
  coupons: {
    id: number;
    tier: string;
    discountPercent: number;
    code: string;
    wcCouponId: number | null;
    storeKey: string | null;
    status: string;
    wcUsageCount: number;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
}> {
  const summary = await getLoyaltySummary(customerId);
  const ledger = await db
    .select()
    .from(loyaltyLedgerTable)
    .where(eq(loyaltyLedgerTable.customerId, customerId))
    .orderBy(asc(loyaltyLedgerTable.createdAt));
  const coupons = await db
    .select()
    .from(loyaltyCouponsTable)
    .where(eq(loyaltyCouponsTable.customerId, customerId))
    .orderBy(desc(loyaltyCouponsTable.createdAt));
  return {
    summary,
    ledger: ledger.map((r) => ({
      id: r.id,
      points: r.points,
      reason: r.reason,
      source: r.source,
      wcOrderId: r.wcOrderId,
      storeKey: r.storeKey,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
    coupons: coupons.map((r) => ({
      id: r.id,
      tier: r.tier,
      discountPercent: r.discountPercent,
      code: r.code,
      wcCouponId: r.wcCouponId,
      storeKey: r.storeKey,
      status: r.status,
      wcUsageCount: r.wcUsageCount,
      lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}
