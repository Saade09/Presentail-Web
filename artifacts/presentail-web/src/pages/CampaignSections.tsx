import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { apiFetch } from "@/lib/api";
import { ProductImage } from "@/components/ProductImage";
import { SalePrice } from "@/components/SalePrice";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { fireGtagEvent } from "@/lib/gtag";
import { CAMPAIGN_SECTION_KEY } from "@/lib/campaign";
import { type CampaignCatalogProduct } from "@/lib/campaignLanding";
import {
  CircularCollectionCarousel,
  type CircularCarouselItem,
} from "@/components/homepage/CircularCollectionCarousel";
import { OCCASION_STATIC_IMAGES } from "@/lib/categoryGroups";

function CampaignProductCard({
  product,
  index,
  onClickCapture,
}: {
  product: CampaignCatalogProduct;
  index: number;
  onClickCapture: () => void;
}) {
  const { language, t } = useLocale();
  const { city } = useLocationSelection();
  const imageUrl = product.image?.uri;

  const fallbackTile = (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-stone-100 px-3 text-center">
      <span className="text-stone-400 font-serif text-sm leading-snug line-clamp-4">
        {product.name}
      </span>
    </div>
  );

  return (
    <div
      className="group"
      data-testid={`campaign-card-${product.id}`}
      onClickCapture={onClickCapture}
    >
      <Link href={`/product/${product.id}`}>
        <div className="relative aspect-square overflow-hidden rounded-xl bg-stone-100 mb-2.5">
          {imageUrl ? (
            <ProductImage
              src={imageUrl}
              product={{ name: product.name }}
              locale={language}
              cityName={city?.name ?? ""}
              className="object-cover w-full h-full group-hover:scale-[1.02] transition-transform duration-500"
              sizes="(max-width: 760px) 48vw, (max-width: 1080px) 32vw, 25vw"
              width={400}
              height={400}
              priority={index < 2}
              fallback={fallbackTile}
            />
          ) : (
            fallbackTile
          )}

          {product.isBestSeller && (
            <div
              className="absolute start-2 top-2 rounded-full bg-[#00414e] px-2.5 py-1 text-[10px] font-semibold leading-none tracking-wide text-white"
            >
              {t("campaign.redesign.bestSeller")}
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <h3 className="font-serif text-sm leading-snug line-clamp-2 text-neutral-900">
            {product.name}
          </h3>
          <p className="text-xs font-medium text-[#577075]">
            {t("campaign.redesign.availableToday")}
          </p>
          <p className="text-sm font-medium text-neutral-900">
            <SalePrice
              priceValue={product.priceValue}
              discountPriceValue={product.discountPriceValue}
              discountPriceAed={product.discountPriceAed}
            />
          </p>
        </div>
      </Link>
    </div>
  );
}

const GRID_SIZE = 8;

export function CampaignGrid({
  section,
  title,
  sub,
  viewAllLink,
  viewAllText,
  products,
  isLoading,
  id,
}: {
  section: "flowers" | "luxury";
  title: string;
  sub?: string;
  viewAllLink?: string;
  viewAllText?: string;
  products: CampaignCatalogProduct[];
  isLoading: boolean;
  id?: string;
}) {
  const { t } = useLocale();
  const displayProducts = products.slice(0, GRID_SIZE);

  return (
    <section
      id={id}
      className="container mx-auto max-w-content px-page pt-8 scroll-mt-24"
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex items-end justify-between mb-1.5">
        <h2
          id={`${id}-heading`}
          className="font-serif text-2xl md:text-3xl"
        >
          {title}
        </h2>
        {viewAllLink && viewAllText && (
          <Link
            href={viewAllLink}
            onClick={() => {
              trackEvent({
                name: "campaign_view_all_click",
                sectionKey: `${CAMPAIGN_SECTION_KEY}:${section}`,
                linkSlug: section,
              });
              fireGtagEvent("campaign_view_all_click", {
                section: CAMPAIGN_SECTION_KEY,
                campaign_section: section,
              });
            }}
            className="text-sm text-primary hover:underline whitespace-nowrap py-2 shrink-0 ml-4"
            data-testid={`link-campaign-grid-view-all-${section}`}
          >
            {viewAllText}
          </Link>
        )}
      </div>

      {sub && (
        <p className="text-sm text-neutral-500 mb-4 leading-snug">
          {sub}
        </p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 min-[760px]:grid-cols-3 min-[1080px]:grid-cols-4 gap-3 md:gap-5">
          {Array.from({ length: GRID_SIZE }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="h-3.5 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
              <Skeleton className="h-3.5 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : displayProducts.length > 0 ? (
        <div className="grid grid-cols-2 min-[760px]:grid-cols-3 min-[1080px]:grid-cols-4 gap-3 md:gap-5">
          {displayProducts.map((product, i) => (
            <CampaignProductCard
              key={product.id}
              product={product}
              index={i}
              onClickCapture={() => {
                trackEvent({
                  name: "product_card_click",
                  productId: product.id,
                  sectionKey: `${CAMPAIGN_SECTION_KEY}:${section}`,
                  displayedPosition: i + 1,
                });
                fireGtagEvent("select_item", {
                  item_list_id: `${CAMPAIGN_SECTION_KEY}:${section}`,
                  item_id: product.id,
                  index: i + 1,
                });
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl border border-[#d9dfd8] bg-white px-5 py-8 text-center text-sm text-[#577075]"
          data-testid={`campaign-grid-empty-${section}`}
        >
          {t("campaign.redesign.empty")}
        </div>
      )}
    </section>
  );
}

const OCCASION_SLUGS = [
  "birthday",
  "anniversary",
  "get-well-soon",
  "congratulations",
  "new-born",
  "im-sorry",
] as const;

export function CampaignOccasions() {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();

  const { data, isLoading } = useQuery({
    queryKey: ["homepage", "occasions", countryCode, cityId, language],
    queryFn: () => {
      const params = new URLSearchParams();
      if (countryCode) params.set("countryCode", countryCode);
      if (cityId) params.set("cityId", cityId);
      if (language && language !== "en") params.set("lang", language);
      const qs = params.toString();
      return apiFetch<{ items: { id: string; name: string; slug: string; imageUrl: string; isActive: boolean }[] }>(
        `/homepage/occasions${qs ? `?${qs}` : ""}`,
      );
    },
  });

  const apiBySlug = new Map((data?.items ?? []).map((i) => [i.slug, i]));
  const items: CircularCarouselItem[] = OCCASION_SLUGS.flatMap((slug) => {
    const api = apiBySlug.get(slug);
    if (!api?.isActive) return [];
    return [
      {
        id: api.id,
        label: api.name,
        slug: api.slug,
        imageUrl: api.imageUrl || OCCASION_STATIC_IMAGES[slug] || "",
        href: `/occasion/${encodeURIComponent(slug)}`,
      } satisfies CircularCarouselItem,
    ];
  });

  if (!isLoading && items.length === 0) return null;

  return (
    <div className="container mx-auto max-w-content px-page mt-8">
      <CircularCollectionCarousel
        title={t("campaign.v2.occasions.title")}
        items={items}
        isLoading={isLoading}
        testId="section-campaign-occasions"
      />
    </div>
  );
}

export function CampaignAddressExplainer() {
  const { t } = useLocale();

  const steps = [
    {
      n: 1,
      title: t("campaign.v2.address.step1.title"),
      body: t("campaign.v2.address.step1.body"),
      emphasisRange: null as null | [number, number],
    },
    {
      n: 2,
      title: t("campaign.v2.address.step2.title"),
      body: null as null | string,
      emphasisRange: null as null | [number, number],
    },
    {
      n: 3,
      title: t("campaign.v2.address.step3.title"),
      body: t("campaign.v2.address.step3.body"),
      emphasisRange: null as null | [number, number],
    },
  ];

  return (
    <section
      className="bg-[#FAF6EF] mt-10"
      aria-labelledby="address-explainer-heading"
    >
      <div className="container mx-auto max-w-content px-page py-10 md:py-14">
        <div className="mb-8 md:mb-10 max-w-xl">
          <h2
            id="address-explainer-heading"
            className="font-serif text-2xl md:text-3xl mb-3"
          >
            {t("campaign.v2.address.heading")}
          </h2>
          <p className="text-neutral-600 text-base leading-relaxed">
            {t("campaign.v2.address.sub")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          <div className="bg-white rounded-2xl px-6 py-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00414e] text-white text-sm font-bold">
                1
              </span>
              <h3 className="font-serif text-lg leading-snug">{steps[0].title}</h3>
            </div>
            <p className="text-neutral-600 text-sm leading-relaxed">{steps[0].body}</p>
          </div>

          <div className="bg-white rounded-2xl px-6 py-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00414e] text-white text-sm font-bold">
                2
              </span>
              <h3 className="font-serif text-lg leading-snug">{steps[1].title}</h3>
            </div>
            <p className="text-neutral-600 text-sm leading-relaxed">
              <strong className="font-semibold text-neutral-900">
                {t("campaign.v2.address.step2.emphasis")}
              </strong>
              {t("campaign.v2.address.step2.body2")}
            </p>
          </div>

          <div className="bg-white rounded-2xl px-6 py-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00414e] text-white text-sm font-bold">
                3
              </span>
              <h3 className="font-serif text-lg leading-snug">{steps[2].title}</h3>
            </div>
            <p className="text-neutral-600 text-sm leading-relaxed">{steps[2].body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FiveStars() {
  const { t } = useLocale();
  return (
    <div className="flex gap-0.5" aria-label={t("campaign.v2.reviews.fiveStars")} role="img">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-[#00B67A]"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

const PLACEHOLDER_REVIEWS = [
  {
    key: "abroad",
    quote:
      "I was ordering from London and had no clue how to arrange delivery to my sister in Beirut without her knowing. They contacted her directly, got the address, and delivered the same day. Completely seamless from start to finish.",
    reviewer: "Sarah M.",
    product: "Plum Florals",
  },
  {
    key: "speed",
    quote:
      "Ordered at noon, flowers were on my mother's doorstep by 3 PM. Looked exactly like the photos — no substitutions, no surprises. Genuinely the fastest flower delivery I've used anywhere.",
    reviewer: "Rami K.",
    product: "Classic Chocolate Box",
  },
  {
    key: "tracking",
    quote:
      "Got a photo the moment the delivery landed. My girlfriend had no idea I'd arranged the whole thing from Dubai. The tracking updates made it feel personal even from that far away.",
    reviewer: "Omar H.",
    product: "The Birthday Bundle",
  },
] as const;

export function CampaignReviews() {
  const { t } = useLocale();

  return (
    <section
      className="container mx-auto max-w-content px-page pt-10 pb-6"
      aria-labelledby="reviews-heading"
    >
      <div className="flex items-end justify-between mb-6">
        <h2
          id="reviews-heading"
          className="font-serif text-2xl md:text-3xl"
        >
          {t("campaign.v2.reviews.heading")}
        </h2>
        <a
          href="https://www.trustpilot.com/review/presentail.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline whitespace-nowrap py-2 shrink-0 ml-4"
          data-testid="link-campaign-reviews-read-all"
        >
          {t("campaign.v2.reviews.readAll")}
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {PLACEHOLDER_REVIEWS.map((r) => (
          <div
            key={r.key}
            className="bg-white border border-neutral-200 rounded-2xl px-5 py-5 flex flex-col gap-3"
          >
            <FiveStars />
            <p className="text-neutral-700 text-sm leading-relaxed flex-1">
              &ldquo;{r.quote}&rdquo;
            </p>
            <div className="text-xs text-neutral-500 leading-snug">
              <span className="font-semibold text-neutral-700">{r.reviewer}</span>
              {" · "}
              {r.product}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-sm text-neutral-500">
        {t("campaign.v2.reviews.aggregate")}
      </p>
    </section>
  );
}
