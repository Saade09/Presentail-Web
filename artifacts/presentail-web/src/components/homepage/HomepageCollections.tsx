import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import {
  CircularCollectionCarousel,
  type CircularCarouselItem,
} from "./CircularCollectionCarousel";
import { CATEGORY_STATIC_IMAGES, CATEGORY_SLUG_REMAP, OCCASION_STATIC_IMAGES } from "@/lib/categoryGroups";

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
  const { language } = useLocale();
  return useQuery({
    queryKey: ["homepage", endpoint, countryCode, cityId, language],
    queryFn: () => {
      const params = new URLSearchParams();
      if (countryCode) params.set("countryCode", countryCode);
      if (cityId) params.set("cityId", cityId);
      if (language && language !== "en") params.set("lang", language);
      const qs = params.toString();
      return apiFetch<{ items: CollectionItem[] }>(`/homepage/${endpoint}${qs ? `?${qs}` : ""}`);
    },
  });
}

function toCarouselItem(i: CollectionItem, href: string): CircularCarouselItem {
  return {
    id: i.id,
    label: i.name,
    slug: i.slug,
    imageUrl: i.imageUrl,
    href,
  };
}

function CategoriesRow() {
  const { t } = useLocale();
  const { data, isLoading, isError } = useHomepageCollection("categories");

  const items: CircularCarouselItem[] =
    data?.items
      .filter((i) => i.isActive)
      .map((i) => {
        const staticImg = CATEGORY_STATIC_IMAGES[i.slug] || "";
        const base = toCarouselItem(i, `/category/${encodeURIComponent(CATEGORY_SLUG_REMAP[i.slug] ?? i.slug)}`);
        return {
          ...base,
          imageUrl: base.imageUrl || staticImg,
          fallbackImageUrl: staticImg,
        };
      }) ?? [];

  if (!isLoading && (isError || items.length === 0)) return null;
  return (
    <CircularCollectionCarousel
      title={t("categories.title")}
      items={items}
      isLoading={isLoading}
      testId="section-home-categories"
      className="pb-2 md:pb-4"
    />
  );
}

function OccasionsRow({ title }: { title: string }) {
  const { data, isLoading, isError } = useHomepageCollection("occasions");
  const items: CircularCarouselItem[] =
    data?.items
      .filter((i: CollectionItem) => i.isActive)
      .map((i: CollectionItem) => {
        const base = toCarouselItem(i, `/occasion/${encodeURIComponent(i.slug)}`);
        return {
          ...base,
          imageUrl: base.imageUrl || OCCASION_STATIC_IMAGES[i.slug] || "",
        };
      }) ?? [];
  if (!isLoading && (isError || items.length === 0)) return null;
  return (
    <CircularCollectionCarousel
      title={title}
      items={items}
      isLoading={isLoading}
      testId="section-home-occasions"
      className="pt-2 md:pt-4"
    />
  );
}

export function HomepageCollections() {
  const { t } = useLocale();
  return (
    <>
      <CategoriesRow />
      <OccasionsRow title={t("occasions.title")} />
    </>
  );
}
