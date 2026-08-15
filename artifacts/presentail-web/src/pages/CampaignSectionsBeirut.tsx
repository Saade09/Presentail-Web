/**
 * CampaignSectionsBeirut.tsx
 * Pass 2A sections for the Beirut flower-delivery campaign landing page.
 *
 * Gate: every export here is rendered ONLY inside the isBeirutPaidVariant
 * block in CampaignLanding.tsx.  Nothing here touches shared components,
 * global stylesheets, other routes, or the SEO injection layer.
 *
 * Search "TODO(UNVERIFIED)" for every claim that still needs real data
 * before the page goes live.  There are six categories:
 *   1. Product descriptors (name-fragment–matched, not slug-verified)
 *   2. Corner tag assignments — especially "Ships in 2h" (commented out)
 *   3. Occasion URL slugs for Get Well and Sympathy pills
 *   4. Review quotes, reviewer names, products they ordered
 *   5. Aggregate rating (4.8) and review count (1,240)
 *   6. Handwritten card at checkout (step 1 of address explainer)
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { apiFetch } from "@/lib/api";
import { ProductImage } from "@/components/ProductImage";
import { SalePrice } from "@/components/SalePrice";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { fireGtagEvent } from "@/lib/gtag";
import { CAMPAIGN_SECTION_KEY } from "@/lib/campaign";
import { type Product } from "@/lib/queries";
import {
  CircularCollectionCarousel,
  type CircularCarouselItem,
} from "@/components/homepage/CircularCollectionCarousel";
import { OCCASION_STATIC_IMAGES } from "@/lib/categoryGroups";

// ─────────────────────────────────────────────────────────────────────────────
// Static overlay data — descriptors and corner tags
//
// Descriptors are keyed by a lowercase name fragment.  The price shown on
// each card comes from the live API via useDisplayCurrency — only the
// one-line descriptor text is hardcoded here.
//
// TODO(UNVERIFIED): ALL descriptor strings below must be verified against
// the live Presentail OS catalog before launch.  When slugs are confirmed
// from the OS admin panel, replace name-fragment keys with exact slug keys.
// ─────────────────────────────────────────────────────────────────────────────

const DESCRIPTORS: ReadonlyArray<readonly [string, string]> = [
  ["plum floral", "roses, lisianthus and eucalyptus"],
  ["chocolate rocher cake", "serves 8, candles included"],
  ["birthday bundle", "bouquet + cake + balloons"],
  ["classic chocolate box", "assorted, ribbon-wrapped"],
  ["ferrero rocher box", "24 pieces — add to any bouquet"],
  ["red heart balloon", "helium, delivered inflated"],
  ["pink balloon", "helium bunch, ribboned"],
  ["birthday candle", "add to any cake"],
];

function getDescriptor(name: string): string | undefined {
  const lower = name.toLowerCase();
  return DESCRIPTORS.find(([key]) => lower.includes(key))?.[1];
}

// Corner tags — shown sparingly.  Tagging every product "Best seller"
// carries no information; use at most 2–3 per grid.
//
// TODO(UNVERIFIED): confirm tag assignments with the product team.
// The "Ships in 2h" tag is commented out pending ops confirmation that
// same-day dispatch within 2 hours is guaranteed for those SKUs.
const TAGS: ReadonlyArray<readonly [string, { label: string; crimson?: boolean }]> = [
  ["plum floral", { label: "Best seller" }],
  ["birthday bundle", { label: "Most gifted" }],
  // ["<slug-fragment>", { label: "Ships in 2h", crimson: true }],
];

function getTag(name: string): { label: string; crimson?: boolean } | undefined {
  const lower = name.toLowerCase();
  return TAGS.find(([key]) => lower.includes(key))?.[1];
}

// ─────────────────────────────────────────────────────────────────────────────
// CampaignProductCard — local to this file, not exported.
// Does NOT extend or modify the shared ProductCard — it is a standalone
// campaign-specific card with a rich fallback tile, explicit dimensions,
// and descriptor support.
// ─────────────────────────────────────────────────────────────────────────────

function CampaignProductCard({
  product,
  index,
  onClickCapture,
}: {
  product: Product;
  index: number;
  onClickCapture: () => void;
}) {
  const { language } = useLocale();
  const { city } = useLocationSelection();
  const imageUrl = product.image?.uri;
  const descriptor = getDescriptor(product.name);
  const tag = getTag(product.name);

  // Warm neutral fallback tile — displayed when image is missing or fails
  // to load.  Shows the product name so the card is never a blank box.
  // bg-stone-100 is a warm off-white that feels warm rather than broken.
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
        {/* Square image container.  bg-stone-100 is always present behind
            the image so there is no flash of white or grey on slow loads. */}
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
              // First two cards (top row on 2-col mobile) are above the fold —
              // eager-load them; the rest are lazy.
              priority={index < 2}
              fallback={fallbackTile}
            />
          ) : (
            fallbackTile
          )}

          {/* Corner tag — rendered only when a tag is assigned in TAGS above.
              "Ships in 2h" uses crimson #C0152A; other tags use brand teal. */}
          {tag && (
            <div
              className="absolute top-2 left-2 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full tracking-wide leading-none"
              style={{ backgroundColor: tag.crimson ? "#C0152A" : "#00414e" }}
            >
              {tag.label}
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <h3 className="font-serif text-sm leading-snug line-clamp-2 text-neutral-900">
            {product.name}
          </h3>
          {/* TODO(UNVERIFIED): descriptor text — see DESCRIPTORS map above */}
          {descriptor && (
            <p className="text-neutral-500 text-xs leading-snug line-clamp-1">{descriptor}</p>
          )}
          <p className="text-sm font-medium text-neutral-900">
            {/* Price comes from the live API; display currency is resolved by
                useDisplayCurrency inside SalePrice. */}
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

// ─────────────────────────────────────────────────────────────────────────────
// CampaignGridBeirut
// Replaces the two separate CampaignProductGrid calls (flower-boxes +
// lux-arrangements) that were on the Beirut paid-search variant.
//
// Products come from useGetHomepageBestSellers, already fetched by the
// parent (CampaignLanding) — no new network requests.
// ─────────────────────────────────────────────────────────────────────────────

const GRID_SIZE = 8;

export function CampaignGridBeirut({
  products,
  isLoading,
}: {
  products: Product[];
  isLoading: boolean;
}) {
  const { t } = useLocale();

  const displayProducts = products.slice(0, GRID_SIZE);

  return (
    <section
      className="container mx-auto max-w-content px-page pt-8"
      aria-labelledby="campaign-grid-heading"
    >
      {/* Heading row */}
      <div className="flex items-end justify-between mb-1.5">
        <h2
          id="campaign-grid-heading"
          className="font-serif text-2xl md:text-3xl"
        >
          {t("campaign.v2.grid.title")}
        </h2>
        <Link
          href="/best-sellers"
          onClick={() => {
            trackEvent({ name: "campaign_view_all_click", sectionKey: CAMPAIGN_SECTION_KEY });
            fireGtagEvent("campaign_view_all_click", { section: CAMPAIGN_SECTION_KEY });
          }}
          className="text-sm text-primary hover:underline whitespace-nowrap py-2 shrink-0 ml-4"
          data-testid="link-campaign-grid-view-all"
        >
          {t("campaign.v2.grid.viewAll")}
        </Link>
      </div>

      {/* Sub-line */}
      <p className="text-sm text-neutral-500 mb-4 leading-snug">
        {t("campaign.v2.grid.sub")}
      </p>

      {/* Product grid:
          2 columns on mobile,
          3 from 760 px (most tablets in portrait),
          4 from 1080 px (landscape tablet / desktop). */}
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
      ) : (
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
                  sectionKey: CAMPAIGN_SECTION_KEY,
                  displayedPosition: i + 1,
                });
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CampaignOccasionsBeirut
//
// "Shop by Occasion" section — replaces the old inline pill chips that were
// embedded inside CampaignGridBeirut.  Uses the same CircularCollectionCarousel
// component as the Beirut city home (/en-lb/beirut → HomepageCollections →
// OccasionsRow), so visitors see a consistent visual treatment.
//
// Occasions included, in this order, per product brief:
//   Birthday · Anniversary · Get Well Soon · Congratulations · New Baby · I'm Sorry
//
// Deliberate exclusions (do NOT add without a dedicated landing page):
//   Funeral — jarring alongside pink tulips / birthday bundles / balloon upsells.
//   Wedding — long consideration purchase; needs an enquiry flow, not add-to-cart.
//
// Links use root-relative /occasion/<slug>.  Wouter resolves these against the
// current locale base (/en-lb/beirut/), so the Beirut city and same-day
// delivery context carries through to each occasion page automatically.
// ─────────────────────────────────────────────────────────────────────────────

type OccasionApiItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
  isActive: boolean;
};

// Ordered exactly as specified.  Funeral and Wedding intentionally absent.
const BEIRUT_OCCASION_SLUGS = [
  "birthday",
  "anniversary",
  "get-well-soon",
  "congratulations",
  "new-born",
  "im-sorry",
] as const;

export function CampaignOccasionsBeirut() {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();

  const { data, isLoading } = useQuery({
    // Reuse the same query key shape as HomepageCollections → OccasionsRow so
    // React Query dedups the request if HomepageCollections is also mounted.
    queryKey: ["homepage", "occasions", countryCode, cityId, language],
    queryFn: () => {
      const params = new URLSearchParams();
      if (countryCode) params.set("countryCode", countryCode);
      if (cityId) params.set("cityId", cityId);
      if (language && language !== "en") params.set("lang", language);
      const qs = params.toString();
      return apiFetch<{ items: OccasionApiItem[] }>(
        `/homepage/occasions${qs ? `?${qs}` : ""}`,
      );
    },
  });

  // Build items in the specified order.  Skip any occasion the API does not
  // return or marks inactive — graceful degradation, no hard failure.
  const apiBySlug = new Map((data?.items ?? []).map((i) => [i.slug, i]));
  const items: CircularCarouselItem[] = BEIRUT_OCCASION_SLUGS.flatMap((slug) => {
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

  // Don't flash a heading-with-no-circles after a failed API call.
  if (!isLoading && items.length === 0) return null;

  return (
    <div className="container mx-auto max-w-content px-page">
      <CircularCollectionCarousel
        title={t("campaign.v2.occasions.title")}
        items={items}
        isLoading={isLoading}
        testId="section-campaign-beirut-occasions"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CampaignAddressExplainerBeirut
// New section, contrasting warm-cream background.
// Addresses the primary objection from gift senders: "I don't have their
// address."  Three numbered steps in a single column on mobile, three
// columns on desktop.
// ─────────────────────────────────────────────────────────────────────────────

export function CampaignAddressExplainerBeirut() {
  const { t } = useLocale();

  const steps = [
    {
      n: 1,
      title: t("campaign.v2.address.step1.title"),
      // TODO(UNVERIFIED): "Add a handwritten card at checkout — we write it
      // by hand at the shop."  Confirm this service is offered and reliable
      // with the Achrafieh operations team before launch.
      body: t("campaign.v2.address.step1.body"),
      emphasisRange: null as null | [number, number],
    },
    {
      n: 2,
      title: t("campaign.v2.address.step2.title"),
      // "That's all we need" is bolded per spec.
      // Locale key step2.emphasis holds that phrase; step2.body2 holds the rest.
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
    // Contrasting warm-cream section — same tone as the original hero background
    // so it feels like part of the brand, not a generic divider.
    <section
      className="bg-[#FAF6EF] mt-10"
      aria-labelledby="address-explainer-heading"
    >
      <div className="container mx-auto max-w-content px-page py-10 md:py-14">
        {/* Heading + sub */}
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

        {/* Three numbered step cards — 1-col mobile, 3-col desktop */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {/* Step 1 */}
          <div className="bg-white rounded-2xl px-6 py-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00414e] text-white text-sm font-bold">
                1
              </span>
              <h3 className="font-serif text-lg leading-snug">{steps[0].title}</h3>
            </div>
            <p className="text-neutral-600 text-sm leading-relaxed">{steps[0].body}</p>
          </div>

          {/* Step 2 */}
          <div className="bg-white rounded-2xl px-6 py-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00414e] text-white text-sm font-bold">
                2
              </span>
              <h3 className="font-serif text-lg leading-snug">{steps[1].title}</h3>
            </div>
            <p className="text-neutral-600 text-sm leading-relaxed">
              {/* "That's all we need" is emphasised per spec */}
              <strong className="font-semibold text-neutral-900">
                {t("campaign.v2.address.step2.emphasis")}
              </strong>
              {t("campaign.v2.address.step2.body2")}
            </p>
          </div>

          {/* Step 3 */}
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

// ─────────────────────────────────────────────────────────────────────────────
// CampaignReviewsBeirut
// Replaces TrustpilotCarousel on the Beirut variant, which rendered as a
// heading above a large blank gap (the carousel widget failed to mount).
// A blank section on a paid-traffic landing page is worse than no section.
//
// Three static review cards, each addressing a different shopper worry:
//   1. Ordering from abroad without the recipient's address
//   2. Same-day delivery speed
//   3. Live tracking and communication
//
// TODO(UNVERIFIED): ALL review content below — quotes, names, and product
// names — is placeholder copy.  Replace with real Trustpilot reviews pulled
// from https://www.trustpilot.com/review/presentail.com.  Choose reviews
// that address the three worry categories above.
//
// TODO(UNVERIFIED): The aggregate numbers (4.8 out of 5, 1,240 reviews)
// must be verified against the live Trustpilot business dashboard.
// ─────────────────────────────────────────────────────────────────────────────

// Five filled gold stars — rendered as an SVG row rather than emoji so colour
// is consistent across platforms and font stacks.
function FiveStars() {
  return (
    <div className="flex gap-0.5" aria-label="5 out of 5 stars" role="img">
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

// TODO(UNVERIFIED): placeholder reviews.  See file-level comment above.
const PLACEHOLDER_REVIEWS = [
  {
    key: "abroad",
    // Worry addressed: ordering from abroad without the address
    quote:
      "I was ordering from London and had no clue how to arrange delivery to my sister in Beirut without her knowing. They contacted her directly, got the address, and delivered the same day. Completely seamless from start to finish.",
    reviewer: "Sarah M.",
    product: "Plum Florals",
  },
  {
    key: "speed",
    // Worry addressed: same-day speed
    quote:
      "Ordered at noon, flowers were on my mother's doorstep by 3 PM. Looked exactly like the photos — no substitutions, no surprises. Genuinely the fastest flower delivery I've used anywhere.",
    reviewer: "Rami K.",
    product: "Classic Chocolate Box",
  },
  {
    key: "tracking",
    // Worry addressed: live tracking and communication
    quote:
      "Got a photo the moment the delivery landed. My girlfriend had no idea I'd arranged the whole thing from Dubai. The tracking updates made it feel personal even from that far away.",
    reviewer: "Omar H.",
    product: "The Birthday Bundle",
  },
] as const;

export function CampaignReviewsBeirut() {
  const { t } = useLocale();

  return (
    <section
      className="container mx-auto max-w-content px-page pt-10 pb-6"
      aria-labelledby="reviews-heading"
    >
      {/* Heading row */}
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

      {/* Three review cards — 1-col mobile, 3-col desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {/* TODO(UNVERIFIED): replace all review content with real Trustpilot reviews */}
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

      {/* Aggregate rating line
          TODO(UNVERIFIED): verify "4.8 out of 5" and "1,240 verified reviews"
          against the live Trustpilot business dashboard before launch. */}
      <p className="mt-5 text-center text-sm text-neutral-500">
        {t("campaign.v2.reviews.aggregate")}
      </p>
    </section>
  );
}
