import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import {
  CircularCollectionCarousel,
  type CircularCarouselItem,
} from "./CircularCollectionCarousel";

type CollectionItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
};

function useHomepageCollection(endpoint: "categories" | "occasions") {
  const { countryCode, cityId } = useLocationSelection();
  return useQuery({
    queryKey: ["homepage", endpoint, countryCode, cityId],
    queryFn: () =>
      apiFetch<{ items: CollectionItem[] }>(`/homepage/${endpoint}`),
  });
}

function CategoriesRow({ title }: { title: string }) {
  const { data, isLoading, isError } = useHomepageCollection("categories");
  const items: CircularCarouselItem[] =
    data?.items
      .filter((i: CollectionItem) => i.isActive)
      .map((i: CollectionItem) => ({
        id: i.id,
        label: i.name,
        slug: i.slug,
        imageUrl: i.imageUrl,
        href: `/category/${encodeURIComponent(i.slug)}`,
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
  const { data, isLoading, isError } = useHomepageCollection("occasions");
  const items: CircularCarouselItem[] =
    data?.items
      .filter((i: CollectionItem) => i.isActive)
      .map((i: CollectionItem) => ({
        id: i.id,
        label: i.name,
        slug: i.slug,
        imageUrl: i.imageUrl,
        href: `/occasion/${encodeURIComponent(i.slug)}`,
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
