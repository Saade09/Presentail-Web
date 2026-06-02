import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, customerOccasionsTable } from "@workspace/db";
import { authenticate } from "../lib/auth";
import { requireUserType } from "../lib/requireUserType";
import { getCustomerByWcId } from "../lib/customers";

const router: IRouter = Router();

const occasionInputSchema = z.object({
  label: z.string().trim().min(1).max(100),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  note: z.string().trim().max(500).nullish(),
});

async function resolveCustomerId(
  req: Parameters<typeof authenticate>[1],
  authHeader: string | undefined,
): Promise<
  | { ok: true; customerId: number }
  | { ok: false; status: number; message: string }
> {
  const auth = await authenticate(authHeader, req);
  if (!auth.ok) return auth;
  // Clerk sessions already carry the local customer id — use it directly
  // to avoid a getCustomerByWcId round-trip that fails when WC sync hasn't
  // run yet (e.g. freshly signed-up Clerk users without a WC mirror).
  if (auth.localCustomerId) {
    return { ok: true, customerId: auth.localCustomerId };
  }
  const local = await getCustomerByWcId(auth.customerId);
  if (!local) {
    return { ok: false, status: 404, message: "Customer profile not found" }; // i18n-ignore
  }
  return { ok: true, customerId: local.id };
}

// GET /api/me/occasions
router.get(
  "/me/occasions",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res.status(resolved.status).json({ ok: false, message: resolved.message });
      return;
    }
    const rows = await db
      .select()
      .from(customerOccasionsTable)
      .where(eq(customerOccasionsTable.customerId, resolved.customerId))
      .orderBy(asc(customerOccasionsTable.month), asc(customerOccasionsTable.day));
    res.json({
      ok: true,
      occasions: rows.map((r) => ({
        id: r.id,
        label: r.label,
        month: r.month,
        day: r.day,
        note: r.note ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  },
);

// POST /api/me/occasions
router.post(
  "/me/occasions",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res.status(resolved.status).json({ ok: false, message: resolved.message });
      return;
    }
    const parsed = occasionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: "Invalid occasion data" }); // i18n-ignore
      return;
    }
    const { label, month, day, note } = parsed.data;
    const [row] = await db
      .insert(customerOccasionsTable)
      .values({
        customerId: resolved.customerId,
        label,
        month,
        day,
        note: note ?? null,
      })
      .returning();
    res.json({
      ok: true,
      occasion: {
        id: row.id,
        label: row.label,
        month: row.month,
        day: row.day,
        note: row.note ?? null,
        createdAt: row.createdAt.toISOString(),
      },
    });
  },
);

// PUT /api/me/occasions/:id
router.put(
  "/me/occasions/:id",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res.status(resolved.status).json({ ok: false, message: resolved.message });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: "Invalid id" }); // i18n-ignore
      return;
    }
    const parsed = occasionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: "Invalid occasion data" }); // i18n-ignore
      return;
    }
    const { label, month, day, note } = parsed.data;
    const [row] = await db
      .update(customerOccasionsTable)
      .set({ label, month, day, note: note ?? null, updatedAt: new Date() })
      .where(
        and(
          eq(customerOccasionsTable.id, id),
          eq(customerOccasionsTable.customerId, resolved.customerId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ ok: false, message: "Occasion not found" }); // i18n-ignore
      return;
    }
    res.json({
      ok: true,
      occasion: {
        id: row.id,
        label: row.label,
        month: row.month,
        day: row.day,
        note: row.note ?? null,
        createdAt: row.createdAt.toISOString(),
      },
    });
  },
);

// DELETE /api/me/occasions/:id
router.delete(
  "/me/occasions/:id",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res.status(resolved.status).json({ ok: false, message: resolved.message });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: "Invalid id" }); // i18n-ignore
      return;
    }
    const deleted = await db
      .delete(customerOccasionsTable)
      .where(
        and(
          eq(customerOccasionsTable.id, id),
          eq(customerOccasionsTable.customerId, resolved.customerId),
        ),
      )
      .returning({ id: customerOccasionsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ ok: false, message: "Occasion not found" }); // i18n-ignore
      return;
    }
    res.json({ ok: true });
  },
);

// GET /api/me/referral-code
router.get(
  "/me/referral-code",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      if (resolved.status === 404) {
        res.status(404).json({ ok: false, code: "no_referral_code" });
      } else {
        res.status(resolved.status).json({ ok: false, message: resolved.message });
      }
      return;
    }
    // Stable, deterministic referral code derived from local customer ID.
    // Format: PT + base-36 representation of the ID, uppercased.
    const code = `PT${resolved.customerId.toString(36).toUpperCase()}`;
    const shareUrl = `https://new.presentail.com/?ref=${code}`;
    res.json({ ok: true, code, shareUrl });
  },
);

export default router;
