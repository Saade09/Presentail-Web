import { db, productSocialSharesTable, type ProductSocialShareRow } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ProductSocialOverrides } from "./productSocialShare";
import { SOCIAL_CARD_TEMPLATE_VERSION, normaliseSocialLayout } from "./productSocialShare";

export async function getProductSocialShare(slug: string): Promise<ProductSocialShareRow | null> {
  const rows = await db
    .select()
    .from(productSocialSharesTable)
    .where(eq(productSocialSharesTable.productSlug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export function rowToProductSocialOverrides(row: ProductSocialShareRow | null): ProductSocialOverrides {
  if (!row) return { templateVersion: SOCIAL_CARD_TEMPLATE_VERSION };
  return {
    customImageUrl: row.customImageUrl,
    preferredImageUrl: row.preferredImageUrl,
    layout: normaliseSocialLayout(row.layout),
    focalX: row.focalX,
    focalY: row.focalY,
    scale: row.scale,
    positionX: row.positionX,
    positionY: row.positionY,
    sourceVersion: row.sourceVersion,
    // The renderer constant is authoritative. Persisting it is useful for
    // inspection, but must never pin edited products to a retired template.
    templateVersion: SOCIAL_CARD_TEMPLATE_VERSION,
  };
}

export async function upsertProductSocialShare(
  slug: string,
  patch: Partial<ProductSocialOverrides>,
  qualityFlags?: string[],
  options: { bumpVersion?: boolean } = {},
): Promise<ProductSocialShareRow> {
  const existing = await getProductSocialShare(slug);
  const bumpVersion = options.bumpVersion ?? true;
  const next = {
    customImageUrl: patch.customImageUrl === undefined ? existing?.customImageUrl ?? null : patch.customImageUrl,
    preferredImageUrl: patch.preferredImageUrl === undefined ? existing?.preferredImageUrl ?? null : patch.preferredImageUrl,
    layout: normaliseSocialLayout(patch.layout ?? existing?.layout),
    focalX: patch.focalX === undefined ? existing?.focalX ?? null : patch.focalX,
    focalY: patch.focalY === undefined ? existing?.focalY ?? null : patch.focalY,
    scale: patch.scale === undefined ? existing?.scale ?? null : patch.scale,
    positionX: patch.positionX === undefined ? existing?.positionX ?? null : patch.positionX,
    positionY: patch.positionY === undefined ? existing?.positionY ?? null : patch.positionY,
    sourceVersion: bumpVersion ? String(Date.now()) : existing?.sourceVersion ?? "1",
    templateVersion: SOCIAL_CARD_TEMPLATE_VERSION,
    qualityFlags: qualityFlags ?? existing?.qualityFlags ?? [],
    updatedAt: bumpVersion ? new Date() : existing?.updatedAt ?? new Date(),
    ...(bumpVersion ? {} : { generatedAt: new Date() }),
  };
  const rows = await db
    .insert(productSocialSharesTable)
    .values({ productSlug: slug, ...next })
    .onConflictDoUpdate({
      target: productSocialSharesTable.productSlug,
      set: next,
    })
    .returning();
  return rows[0]!;
}