import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, orderIdSequencesTable, checkoutAttemptsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const VALID_PREFIXES = new Set(["LB", "AE", "CY"]);

export function countryToPrefix(countryCode: string): string {
  const upper = countryCode.toUpperCase();
  return VALID_PREFIXES.has(upper) ? upper : "LB";
}

const NextOrderIdBody = z.object({
  countryCode: z.string().min(1),
});

router.post("/orders/next-id", async (req, res) => {
  const parsed = NextOrderIdBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "countryCode is required" }); // i18n-ignore
  }

  const prefix = countryToPrefix(parsed.data.countryCode);

  // Atomic increment: UPDATE … RETURNING next_val gives us the value
  // BEFORE the increment (i.e. the claimed sequence number).
  const rows = await db
    .update(orderIdSequencesTable)
    .set({ nextVal: sql`${orderIdSequencesTable.nextVal} + 1` })
    .where(eq(orderIdSequencesTable.prefix, prefix))
    .returning({ claimedVal: orderIdSequencesTable.nextVal });

  if (rows.length === 0) {
    // Row missing — should never happen in production (seeded at migration
    // time), but insert a fallback row so the endpoint degrades gracefully.
    await db.insert(orderIdSequencesTable).values({ prefix, nextVal: 1001 }).onConflictDoNothing();
    return res.json({ ok: true, orderId: `${prefix}-1000` });
  }

  // RETURNING gives the UPDATED value (after +1), so the claimed number
  // is nextVal - 1.
  const claimed = rows[0].claimedVal - 1;
  const orderId = `${prefix}-${claimed}`;

  // Fire-and-forget: record every orderId reservation so abandoned checkouts
  // are visible in the database.  Errors must never block the response.
  const rawPlatform = req.header("x-app-platform");
  const platform = typeof rawPlatform === "string" && rawPlatform ? rawPlatform : null;

  void db
    .insert(checkoutAttemptsTable)
    .values({
      appOrderId: orderId,
      countryCode: prefix,
      platform,
      status: "initiated",
    })
    .onConflictDoNothing()
    .catch(() => {
      // Silently ignore — tracking is best-effort and must not block checkout.
    });

  return res.json({ ok: true, orderId });
});

export default router;
