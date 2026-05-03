import {
  useGetHomepageCategories,
  useGetHomepageOccasions,
} from "@workspace/api-client-react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  CircularCollectionCarousel,
  type CircularCarouselItem,
} from "./CircularCollectionCarousel";

// Wires the generic CircularCollectionCarousel to the
// `/api/homepage/categories` and `/api/homepage/occasions` endpoints. Each
// row is hidden if the query errors or returns zero items so the homepage
// degrades gracefully when WooCommerce is unavailable.

function CategoriesRow({ title }: { title: string }) {
  const { data, isLoading, isError } = useGetHomepageCategories();
  const items: CircularCarouselItem[] =
    data?.items.filter((i) => i.isActive).map((i) => ({
      id: i.id,
      label: i.name,
      imageUrl: i.imageUrl,
      href: `/shop?category=${encodeURIComponent(i.slug)}`,
    })) ?? [];
  if (!isLoading && (isError || items.length === 0)) return null;
  return (
    <CircularCollectionCarousel
      title={title}
      items={items}
      isLoading={isLoading}
      testId="section-home-categories"
    />
  );
}

function OccasionsRow({ title }: { title: string }) {
  const { data, isLoading, isError } = useGetHomepageOccasions();
  const items: CircularCarouselItem[] =
    data?.items.filter((i) => i.isActive).map((i) => ({
      id: i.id,
      label: i.name,
      imageUrl: i.imageUrl,
      href: `/shop?occasion=${encodeURIComponent(i.slug)}`,
    })) ?? [];
  if (!isLoading && (isError || items.length === 0)) return null;
  return (
    <CircularCollectionCarousel
      title={title}
      items={items}
      isLoading={isLoading}
      testId="section-home-occasions"
    />
  );
}

export function HomepageCollections() {
  const { t } = useLocale();
  return (
    <>
      <CategoriesRow title={t("categories.title")} />
      <OccasionsRow title={t("occasions.title")} />
    </>
  );
}
