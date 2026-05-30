import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db, favoritesTable, favoriteShareLinksTable } from "@workspace/db";
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
  requireUserType(["customer", "team"]),
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
  requireUserType(["customer", "team"]),
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

// POST /api/me/favorites/share
router.post(
  "/me/favorites/share",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res.status(resolved.status).json({ ok: false, message: resolved.message });
      return;
    }

    const now = new Date();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + thirtyDays);

    const existing = await db
      .select()
      .from(favoriteShareLinksTable)
      .where(eq(favoriteShareLinksTable.customerId, resolved.customerId))
      .limit(1);

    let token: string;

    if (existing[0] && existing[0].expiresAt > now) {
      token = existing[0].token;
      await db
        .update(favoriteShareLinksTable)
        .set({ expiresAt })
        .where(eq(favoriteShareLinksTable.customerId, resolved.customerId));
    } else {
      token = randomBytes(16).toString("hex");
      await db
        .insert(favoriteShareLinksTable)
        .values({ token, customerId: resolved.customerId, expiresAt })
        .onConflictDoUpdate({
          target: favoriteShareLinksTable.customerId,
          set: { token, expiresAt },
        });
    }

    const baseUrl =
      process.env["PUBLIC_WEB_URL"] ??
      `https://${req.hostname}`;
    const url = `${baseUrl}/favorites/share/${token}`;

    res.json({ ok: true, token, url, expiresAt: expiresAt.toISOString() });
  },
);

// GET /api/favorites/share/:token  (public — no auth required)
router.get("/favorites/share/:token", async (req, res) => {
  const token = String(req.params.token ?? "").trim();
  if (!token) {
    res.status(404).json({ ok: false, message: "Not found" });
    return;
  }

  const link = await db
    .select()
    .from(favoriteShareLinksTable)
    .where(eq(favoriteShareLinksTable.token, token))
    .limit(1);

  if (!link[0] || link[0].expiresAt <= new Date()) {
    res.status(404).json({ ok: false, message: "Share link not found or expired" });
    return;
  }

  const rows = await db
    .select()
    .from(favoritesTable)
    .where(eq(favoritesTable.customerId, link[0].customerId))
    .orderBy(favoritesTable.createdAt);

  res.json({
    ok: true,
    favorites: rows.map((r) => ({
      productSlug: r.productSlug,
      countryCode: r.countryCode,
    })),
    expiresAt: link[0].expiresAt.toISOString(),
  });
});

// DELETE /api/me/favorites/:slug
router.delete(
  "/me/favorites/:slug",
  requireUserType(["customer", "team"]),
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
