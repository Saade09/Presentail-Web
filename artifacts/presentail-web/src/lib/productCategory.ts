type ProductCategorySource = {
  category?: string | null;
  categories?: string[] | null;
};

type CatalogCategory = {
  id: string;
  name: string;
};

/**
 * Resolves the category shown in a product breadcrumb.
 *
 * The plural category list is the source taxonomy from Presentail OS. The
 * singular field is a legacy compatibility value and may contain a stale
 * fallback for categories introduced after an API deployment.
 */
export function resolveProductBreadcrumbCategory<T extends CatalogCategory>(
  product: ProductCategorySource,
  catalogCategories: T[] | null | undefined,
): T | undefined {
  const sourceSlugs =
    product.categories?.length
      ? product.categories
      : product.category
        ? [product.category]
        : [];

  for (const slug of sourceSlugs) {
    const match = catalogCategories?.find((category) => category.id === slug);
    if (match) return match;
  }

  return undefined;
}