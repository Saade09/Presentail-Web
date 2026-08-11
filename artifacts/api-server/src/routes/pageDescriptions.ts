/**
 * Contextual page description endpoints.
 *
 * Public:
 *   GET /api/page-descriptions  — fetch stored description for a page+area+language combo
 *
 * Admin (x-push-admin-token / x-admin-token required):
 *   GET  /api/admin/page-descriptions          — list all rows for a slug
 *   PUT  /api/admin/page-descriptions/:id      — manual edit (sets is_manual_override)
 *   POST /api/admin/page-descriptions/generate — enqueue single generation job
 *   POST /api/admin/page-descriptions/generate-all — bulk seed (with optional filters)
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { checkAdminToken } from "../lib/admin-auth";
import { db } from "@workspace/db";
import { pageContextualDescriptionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { buildFallbackDescription } from "../lib/pageDescriptionGenerator";
import {
  enqueueDescriptionGeneration,
  enqueueBulkSeed,
} from "../lib/pageDescriptionQueue";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response): boolean {
  return checkAdminToken(req, res);
}

// ── GET /api/page-descriptions ──────────────────────────────────────────────
router.get("/page-descriptions", async (req, res) => {
  const pageType = req.query.page_type as string | undefined;
  const slug = req.query.slug as string | undefined;
  const deliveryAreaId = req.query.delivery_area_id as string | undefined;
  const language = (req.query.language as string | undefined) ?? "en";

  if (!pageType || (pageType !== "category" && pageType !== "occasion")) {
    return res.status(400).json({ ok: false, message: "page_type must be 'category' or 'occasion'" }); // i18n-ignore
  }
  if (!slug || typeof slug !== "string" || !slug.trim()) {
    return res.status(400).json({ ok: false, message: "slug is required" }); // i18n-ignore
  }
  if (!deliveryAreaId || typeof deliveryAreaId !== "string" || !deliveryAreaId.trim()) {
    return res.status(400).json({ ok: false, message: "delivery_area_id is required" }); // i18n-ignore
  }
  if (!["en", "ar", "fr"].includes(language)) {
    return res.status(400).json({ ok: false, message: "language must be 'en', 'ar', or 'fr'" }); // i18n-ignore
  }

  try {
    const rows = await db
      .select()
      .from(pageContextualDescriptionsTable)
      .where(
        and(
          eq(pageContextualDescriptionsTable.pageType, pageType as "category" | "occasion"),
          eq(pageContextualDescriptionsTable.pageSlug, slug),
          eq(pageContextualDescriptionsTable.deliveryAreaId, deliveryAreaId),
          eq(pageContextualDescriptionsTable.language, language as "en" | "ar" | "fr"),
        ),
      )
      .limit(1);

    const row = rows[0];

    if (row?.generationStatus === "done" && row.description) {
      return res.json({
        ok: true,
        description: row.description,
        internal_links: row.internalLinks ?? null,
        is_fallback: false,
      });
    }

    // Not ready — enqueue generation and return fallback immediately
    void enqueueDescriptionGeneration({
      pageType: pageType as "category" | "occasion",
      pageSlug: slug,
      deliveryAreaId,
      language: language as "en" | "ar" | "fr",
    }).catch((err: unknown) => {
      req.log.warn(
        { err: (err as Error)?.message },
        "pageDescriptions: enqueue failed (non-fatal)",
      );
    });

    const fallback = buildFallbackDescription(
      pageType as "category" | "occasion",
      slug,
      deliveryAreaId,
      language as "en" | "ar" | "fr",
    );

    return res.json({ ok: true, description: fallback, is_fallback: true });
  } catch (err: unknown) {
    req.log.error({ err: (err as Error)?.message }, "pageDescriptions GET: error");
    return res.status(500).json({ ok: false, message: "Internal error" }); // i18n-ignore
  }
});

// ── GET /api/admin/page-descriptions ────────────────────────────────────────
router.get("/admin/page-descriptions", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const pageType = req.query.page_type as string | undefined;
  const slug = req.query.slug as string | undefined;

  if (!slug || typeof slug !== "string" || !slug.trim()) {
    return res.status(400).json({ ok: false, message: "slug is required" }); // i18n-ignore
  }

  try {
    const conditions = [eq(pageContextualDescriptionsTable.pageSlug, slug)];
    if (pageType === "category" || pageType === "occasion") {
      conditions.push(eq(pageContextualDescriptionsTable.pageType, pageType));
    }

    const rows = await db
      .select()
      .from(pageContextualDescriptionsTable)
      .where(and(...conditions));

    return res.json({ ok: true, rows });
  } catch (err: unknown) {
    req.log.error({ err: (err as Error)?.message }, "admin/page-descriptions GET: error");
    return res.status(500).json({ ok: false, message: "Internal error" }); // i18n-ignore
  }
});

// ── PUT /api/admin/page-descriptions/:id ────────────────────────────────────
router.put("/admin/page-descriptions/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, message: "Invalid id" }); // i18n-ignore
  }

  const body = req.body as { description?: unknown; internal_links?: unknown };
  const description = typeof body.description === "string" ? body.description.trim() : null;

  if (!description) {
    return res.status(400).json({ ok: false, message: "description is required and must be non-empty" }); // i18n-ignore
  }
  if (description.length > 300) {
    return res.status(400).json({ ok: false, message: "description must not exceed 300 characters" }); // i18n-ignore
  }

  // Validate optional internal_links: must be null/undefined, or an array of { label: string; href: string }
  let internalLinks: Array<{ label: string; href: string }> | null = null;
  if (body.internal_links !== undefined && body.internal_links !== null) {
    if (
      !Array.isArray(body.internal_links) ||
      !(body.internal_links as unknown[]).every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).label === "string" &&
          typeof (item as Record<string, unknown>).href === "string",
      )
    ) {
      return res.status(400).json({ ok: false, message: "internal_links must be an array of { label, href } objects" }); // i18n-ignore
    }
    internalLinks = body.internal_links as Array<{ label: string; href: string }>;
  }

  try {
    const updated = await db
      .update(pageContextualDescriptionsTable)
      .set({
        description,
        internalLinks,
        isManualOverride: true,
        generationStatus: "done",
        generatedAt: new Date(),
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(pageContextualDescriptionsTable.id, id))
      .returning();

    if (!updated.length) {
      return res.status(404).json({ ok: false, message: "Row not found" }); // i18n-ignore
    }

    return res.json({ ok: true, row: updated[0] });
  } catch (err: unknown) {
    req.log.error({ err: (err as Error)?.message }, "admin/page-descriptions PUT: error");
    return res.status(500).json({ ok: false, message: "Internal error" }); // i18n-ignore
  }
});

// ── POST /api/admin/page-descriptions/generate ──────────────────────────────
router.post("/admin/page-descriptions/generate", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const body = req.body as {
    page_type?: unknown;
    slug?: unknown;
    delivery_area_id?: unknown;
    language?: unknown;
    force?: unknown;
  };

  const pageType = typeof body.page_type === "string" ? body.page_type : null;
  const slug = typeof body.slug === "string" ? body.slug.trim() : null;
  const deliveryAreaId = typeof body.delivery_area_id === "string" ? body.delivery_area_id.trim() : null;
  const language = typeof body.language === "string" ? body.language : "en";
  const force = body.force === true;

  if (!pageType || (pageType !== "category" && pageType !== "occasion")) {
    return res.status(400).json({ ok: false, message: "page_type must be 'category' or 'occasion'" }); // i18n-ignore
  }
  if (!slug) {
    return res.status(400).json({ ok: false, message: "slug is required" }); // i18n-ignore
  }
  if (!deliveryAreaId) {
    return res.status(400).json({ ok: false, message: "delivery_area_id is required" }); // i18n-ignore
  }
  if (!["en", "ar", "fr"].includes(language)) {
    return res.status(400).json({ ok: false, message: "language must be 'en', 'ar', or 'fr'" }); // i18n-ignore
  }

  void enqueueDescriptionGeneration({
    pageType: pageType as "category" | "occasion",
    pageSlug: slug,
    deliveryAreaId,
    language: language as "en" | "ar" | "fr",
    force,
  }).catch((err: unknown) => {
    req.log.warn(
      { err: (err as Error)?.message },
      "admin/page-descriptions/generate: enqueue failed (non-fatal)",
    );
  });

  return res.json({ ok: true, status: "queued" }); // i18n-ignore
});

// ── POST /api/admin/page-descriptions/generate-all ──────────────────────────
router.post("/admin/page-descriptions/generate-all", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const body = req.body as { page_type?: unknown; slug?: unknown };
  const pageType =
    body.page_type === "category" || body.page_type === "occasion"
      ? body.page_type
      : undefined;
  const slug = typeof body.slug === "string" ? body.slug.trim() : undefined;

  try {
    const count = await enqueueBulkSeed({
      pageType,
      slug: slug || undefined,
    });

    return res.json({ ok: true, status: "queued", count }); // i18n-ignore
  } catch (err: unknown) {
    req.log.error({ err: (err as Error)?.message }, "admin/page-descriptions/generate-all: error");
    return res.status(500).json({ ok: false, message: "Internal error" }); // i18n-ignore
  }
});

export default router;
