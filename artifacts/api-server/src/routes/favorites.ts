import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, favoritesTable } from "@workspace/db";
import { authenticate } from "../lib/auth";
import { requireUserType } from "../lib/requireUserType";
import { getCustomerByWcId } from "../lib/customers";

const router: IRouter = Router();

const addFavoriteSchema = z.object({
  productSlug: z.string().trim().min(1).max(255),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase())
    .nullish(),
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
  const local = await getCustomerByWcId(auth.customerId);
  if (!local) {
    return { ok: false, status: 404, message: "Customer profile not found" };
  }
  return { ok: true, customerId: local.id };
}

// GET /api/me/favorites
router.get(
  "/me/favorites",
  requireUserType(["customer"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res.status(resolved.status).json({ ok: false, message: resolved.message });
      return;
    }
    const rows = await db
      .select()
      .from(favoritesTable)
      .where(eq(favoritesTable.customerId, resolved.customerId))
      .orderBy(favoritesTable.createdAt);
    res.json({
      ok: true,
      favorites: rows.map((r) => ({
        productSlug: r.productSlug,
        countryCode: r.countryCode,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  },
);

// POST /api/me/favorites
router.post(
  "/me/favorites",
  requireUserType(["customer"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res.status(resolved.status).json({ ok: false, message: resolved.message });
      return;
    }
    const parsed = addFavoriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Invalid request",
      });
      return;
    }
    const { productSlug, countryCode } = parsed.data;
    await db
      .insert(favoritesTable)
      .values({
        customerId: resolved.customerId,
        productSlug,
        countryCode: countryCode ?? null,
      })
      .onConflictDoNothing();
    res.json({ ok: true });
  },
);

// DELETE /api/me/favorites/:slug
router.delete(
  "/me/favorites/:slug",
  requireUserType(["customer"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res.status(resolved.status).json({ ok: false, message: resolved.message });
      return;
    }
    const slug = String(req.params.slug ?? "").trim();
    if (!slug) {
      res.status(400).json({ ok: false, message: "Invalid slug" });
      return;
    }
    await db
      .delete(favoritesTable)
      .where(
        and(
          eq(favoritesTable.customerId, resolved.customerId),
          eq(favoritesTable.productSlug, slug),
        ),
      );
    res.json({ ok: true });
  },
);

export default router;
