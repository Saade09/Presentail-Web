import { Router, type IRouter, type Request, type Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { db, pushTokensTable, appOrdersTable, type AppOrder } from "@workspace/db";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  RegisterPushTokenBody,
  UnregisterPushTokenBody,
  SendOrderEventPushBody,
} from "@workspace/api-zod";
import { authenticate } from "../lib/auth";
import { sendOrderEventPush } from "../lib/orderEvents";
import { getCustomerByWcId } from "../lib/customers";
import { creditDeliveredOrder, reverseDeliveredOrder } from "../lib/loyalty";

const router: IRouter = Router();

// /push/register can be called from the same device several times per session
// (sign-in, push-token rotation, home tab focus, etc.), but we have observed
// runaway client loops flooding the server with hundreds of registers per
// minute, which exhausts the DB / WP-JWT validate path and starves unrelated
// requests like /me/addresses. Cap at 30 / minute / IP — well above any
// legitimate flow but tight enough to stop a stuck client from saturating
// the request queue.
const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? ""),
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      ok: false,
      code: "too_many_requests",
      message: "Too many push registrations. Slow down.",
    });
  },
});

// Register an Expo push token for the current device. The signed-in user
// (when an Authorization header is present) is trusted over any
// client-supplied userId, so a malicious client cannot associate their
// token with another user's id and harvest their notifications.
router.post("/push/register", registerLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterPushTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { token, platform, deviceId, countryCode, cityId } = parsed.data;
  const normalizedCountry =
    typeof countryCode === "string" && countryCode.trim()
      ? countryCode.trim().toUpperCase()
      : null;
  const normalizedCity =
    typeof cityId === "string" && cityId.trim() ? cityId.trim() : null;

  let userId: number | null = null;
  const authHeader = req.header("authorization");
  if (authHeader) {
    const auth = await authenticate(authHeader, req);
    if (auth.ok) {
      userId = auth.customerId;
    } else {
      res.status(auth.status).json({ ok: false, message: auth.message });
      return;
    }
  }

  try {
    await db
      .insert(pushTokensTable)
      .values({
        token,
        platform,
        userId,
        deviceId: deviceId ?? null,
        countryCode: normalizedCountry,
        cityId: normalizedCity,
      })
      .onConflictDoUpdate({
        target: pushTokensTable.token,
        set: {
          platform,
          userId,
          deviceId: deviceId ?? null,
          countryCode: normalizedCountry,
          cityId: normalizedCity,
          updatedAt: new Date(),
        },
      });

    // If a deviceId is supplied and the user is now signed in, claim any
    // tokens that were previously registered to this device as a guest so
    // the user receives pushes on their other tokens too.
    if (userId != null && deviceId) {
      await db
        .update(pushTokensTable)
        .set({ userId, updatedAt: new Date() })
        .where(
          and(
            eq(pushTokensTable.deviceId, deviceId),
            isNull(pushTokensTable.userId),
          ),
        );
    }

    res.json({ ok: true });
  } catch (err: any) {
    req.log?.error?.({ err: err?.message }, "push.register failed");
    res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to register token" });
  }
});

// Unregister a push token. Authentication is enforced asymmetrically so an
// attacker who learns another user's deviceId cannot silently delete their
// push subscription:
//   - With a valid Authorization header: delete rows that match the
//     supplied token/deviceId AND are owned by the authenticated user OR
//     are unowned (guest tokens previously issued on this device).
//   - Without auth: only unowned (guest) tokens may be deleted, so an
//     unauthenticated request can never remove a signed-in user's tokens.
router.post("/push/unregister", async (req, res): Promise<void> => {
  const parsed = UnregisterPushTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: "Invalid body" });
    return;
  }
  const { token, deviceId } = parsed.data;
  if (!token && !deviceId) {
    res.status(400).json({ ok: false, message: "Provide token or deviceId" });
    return;
  }

  let authedUserId: number | null = null;
  const authHeader = req.header("authorization");
  if (authHeader) {
    const auth = await authenticate(authHeader, req);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, message: auth.message });
      return;
    }
    authedUserId = auth.customerId;
  }

  try {
    const idConditions = [];
    if (token) idConditions.push(eq(pushTokensTable.token, token));
    if (deviceId) idConditions.push(eq(pushTokensTable.deviceId, deviceId));
    const idMatch =
      idConditions.length === 1 ? idConditions[0] : or(...idConditions);

    const ownerMatch =
      authedUserId != null
        ? or(
            eq(pushTokensTable.userId, authedUserId),
            isNull(pushTokensTable.userId),
          )
        : isNull(pushTokensTable.userId);

    const removed = await db
      .delete(pushTokensTable)
      .where(and(idMatch, ownerMatch))
      .returning({ id: pushTokensTable.id });
    res.json({ ok: true, removed: removed.length });
  } catch (err: any) {
    req.log?.error?.({ err: err?.message }, "push.unregister failed");
    res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to unregister token" });
  }
});

router.post("/push/order-event", async (req, res): Promise<void> => {
  const adminToken = process.env.PUSH_ADMIN_TOKEN;
  const supplied = req.header("x-push-admin-token");
  if (!adminToken || !supplied || supplied !== adminToken) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" });
    return;
  }

  const parsed = SendOrderEventPushBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { state, appOrderId, wcOrderId, title, body } = parsed.data;

  if (!appOrderId && !wcOrderId) {
    res.status(400).json({ ok: false, message: "Provide appOrderId or wcOrderId" });
    return;
  }

  try {
    let order: AppOrder | undefined;
    if (appOrderId) {
      const rows = await db
        .select()
        .from(appOrdersTable)
        .where(eq(appOrdersTable.appOrderId, appOrderId))
        .limit(1);
      order = rows[0];
    } else if (wcOrderId != null) {
      const rows = await db
        .select()
        .from(appOrdersTable)
        .where(eq(appOrdersTable.wcOrderId, wcOrderId))
        .limit(1);
      order = rows[0];
    }

    if (!order) {
      res.status(404).json({ ok: false, message: "Order not found" });
      return;
    }

    const sent = await sendOrderEventPush({
      state,
      appOrderId: order.appOrderId,
      userId: order.userId,
      deviceId: order.deviceId,
      recipientName: order.recipientName,
      customTitle: title,
      customBody: body,
    });

    const previousState = order.state;
    await db
      .update(appOrdersTable)
      .set({ state, updatedAt: new Date() })
      .where(eq(appOrdersTable.id, order.id));

    // Loyalty side-effects: credit on first delivery, reverse on cancel /
    // refund. All best-effort and idempotent — never fail the push response
    // if the loyalty engine has trouble talking to WooCommerce.
    let loyalty: { pointsAwarded?: number; pointsReversed?: number; coupons?: number } | undefined;
    try {
      if (order.userId != null && order.wcOrderId != null) {
        const customer = await getCustomerByWcId(order.userId);
        if (customer) {
          if (state === "delivered" && previousState !== "delivered") {
            const r = await creditDeliveredOrder({
              customerId: customer.id,
              wcOrderId: order.wcOrderId,
              totalUsdCents: order.totalUsdCents ?? 0,
              storeKey: order.storeKey ?? null,
              log: req.log,
            });
            loyalty = {
              pointsAwarded: r.pointsAwarded,
              coupons: r.newCoupons.length,
            };
          } else if (
            (state === "cancelled" || state === "refunded") &&
            previousState === "delivered"
          ) {
            const r = await reverseDeliveredOrder({
              customerId: customer.id,
              wcOrderId: order.wcOrderId,
              storeKey: order.storeKey ?? null,
              reason: state,
              log: req.log,
            });
            loyalty = { pointsReversed: r.pointsReversed };
          }
        }
      }
    } catch (err: any) {
      req.log?.warn?.(
        { err: err?.message, appOrderId: order.appOrderId },
        "push.order-event: loyalty hook failed (non-fatal)",
      );
    }

    res.json({ ok: true, sent, ...(loyalty ? { loyalty } : {}) });
  } catch (err: any) {
    req.log?.error?.({ err: err?.message }, "push.order-event failed");
    res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to send push" });
  }
});

export default router;
