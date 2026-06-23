import { useState, useCallback, useRef, useEffect } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocation } from "wouter";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useSearch } from "@/lib/queries";
import { useLocationSelection } from "@/contexts/LocationContext";
import { ArrowUpRight, CalendarHeart, Loader2, Search, Store, Tag, TrendingUp, X } from "lucide-react";
import { FormattedPrice } from "@/components/FormattedPrice";

interface Props {
  open: boolean;
  onClose: () => void;
  brandSlug?: string;
  brandName?: string;
}

const TRENDING = [
  "Birthday flowers",
  "Red roses",
  "Gift baskets",
  "Wedding bouquets",
  "Congratulations",
];

export function SearchOverlay({ open, onClose, brandSlug, brandName }: Props) {
  const { t } = useLocale();
  const [, navigate] = useLocation();
  const { countryCode, city } = useLocationSelection();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching } = useSearch(q, {
    countryCode: countryCode ?? undefined,
    cityId: city?.id ?? undefined,
  });

  // Auto-focus when opened
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open]);

  const handleSelect = useCallback(
    (href: string) => {
      onClose();
      setQ("");
      navigate(href);
    },
    [navigate, onClose],
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
        setQ("");
      }
    },
    [onClose],
  );

  const hasProducts = (data?.products?.length ?? 0) > 0;
  const hasCategories = (data?.categories?.length ?? 0) > 0;
  const hasOccasions = (data?.occasions?.length ?? 0) > 0;
  const hasBrands = (data?.brands?.length ?? 0) > 0;
  const showEmpty = q.length >= 2 && !isFetching && !hasProducts && !hasCategories && !hasOccasions && !hasBrands;
  const showTrending = q.length < 2;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        {/* Soft blurred backdrop — lighter and more refined than black */}
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[90] bg-black/[0.22] backdrop-blur-[6px]
                     data-[state=open]:animate-in data-[state=closed]:animate-out
                     data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                     duration-200"
        />

        {/* Modal — top-centered like a modern spotlight */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-0 right-0 z-[90] flex justify-center px-4 top-[7vh]
                     data-[state=open]:animate-in data-[state=closed]:animate-out
                     data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                     data-[state=closed]:slide-out-to-top-3 data-[state=open]:slide-in-from-top-3
                     data-[state=closed]:zoom-out-[0.97] data-[state=open]:zoom-in-[0.97]
                     duration-200"
        >
          <DialogPrimitive.Title className="sr-only">{t("nav.searchAria")}</DialogPrimitive.Title>

          <Command
            shouldFilter={false}
            className="w-full max-w-[700px] overflow-hidden rounded-[20px] border border-[#E8E3DC]
                       bg-[#FAFAF8]
                       shadow-[0_16px_64px_rgba(0,0,0,0.13),0_2px_12px_rgba(0,0,0,0.07)]"
          >
            {/* ── Input row ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-5 h-[60px] border-b border-[#EDE9E3]">
              <Search className="w-[18px] h-[18px] text-primary/40 shrink-0" />
              <Command.Input
                ref={inputRef}
                placeholder={t("search.placeholder")}
                value={q}
                onValueChange={setQ}
                className="flex-1 bg-transparent text-[15px] font-medium text-primary
                           placeholder:text-primary/35 outline-none border-0 p-0
                           [&::-webkit-search-cancel-button]:hidden"
              />

              {/* Clear button */}
              {q && (
                <button
                  type="button"
                  onClick={() => { setQ(""); inputRef.current?.focus(); }}
                  aria-label={t("search.clearAria")}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full
                             bg-primary/[0.08] hover:bg-primary/15 text-primary/55
                             transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* ESC hint */}
              <button
                type="button"
                onClick={() => { onClose(); setQ(""); }}
                aria-label={t("search.closeAria")}
                className="shrink-0 text-[11px] font-semibold text-primary/35
                           hover:text-primary/60 tracking-[0.06em] transition-colors"
              >
                ESC
              </button>
            </div>

            {/* ── Results / suggestions ──────────────────────────────────── */}
            <Command.List className="overflow-y-auto max-h-[440px] py-2">

              {/* Trending chips — shown when query is empty */}
              {showTrending && (
                <div className="px-4 pt-2 pb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em]
                                text-primary/35 mb-3">
                    Trending
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TRENDING.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => { setQ(term); inputRef.current?.focus(); }}
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium
                                   text-primary/65 bg-[#EDE9E3] hover:bg-[#E4DFD8]
                                   rounded-full px-3.5 py-1.5 transition-colors"
                      >
                        <TrendingUp className="w-3 h-3 text-primary/40" />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading spinner */}
              {isFetching && q.length >= 2 && (
                <div className="flex items-center justify-center py-10 gap-2 text-sm
                                text-primary/40">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t("search.searching")}</span>
                </div>
              )}

              {/* Empty state */}
              {showEmpty && (
                <div className="py-10 text-center text-sm text-primary/45">
                  No results for{" "}
                  <span className="font-semibold text-primary/70">&ldquo;{q}&rdquo;</span>
                </div>
              )}

              {/* Categories */}
              {!isFetching && hasCategories && (
                <Command.Group
                  heading={t("shop.categoriesTitle")}
                  className="[&_[cmdk-group-heading]]:px-4
                             [&_[cmdk-group-heading]]:py-1.5
                             [&_[cmdk-group-heading]]:text-[10px]
                             [&_[cmdk-group-heading]]:font-semibold
                             [&_[cmdk-group-heading]]:uppercase
                             [&_[cmdk-group-heading]]:tracking-[0.16em]
                             [&_[cmdk-group-heading]]:text-primary/35"
                >
                  {data!.categories.map((cat) => (
                    <Command.Item
                      key={cat.slug}
                      value={`category-${cat.slug}-${cat.name}`}
                      onSelect={() => handleSelect(`/category/${cat.slug}`)}
                      className="mx-2 flex items-center gap-3 px-3 py-2.5 rounded-xl
                                 text-sm cursor-pointer select-none outline-none
                                 aria-selected:bg-[#EDE9E3] hover:bg-[#EDE9E3]
                                 data-[selected=true]:bg-[#EDE9E3]
                                 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/[0.07] flex items-center
                                      justify-center shrink-0">
                        <Tag className="h-3.5 w-3.5 text-primary/55" />
                      </div>
                      <span className="font-medium text-primary/85">{cat.name}</span>
                      <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-primary/25 shrink-0" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Occasions */}
              {!isFetching && hasOccasions && (
                <Command.Group
                  heading={
                    brandName
                      ? `Occasions · from ${brandName}`
                      : "Occasions"
                  }
                  className="[&_[cmdk-group-heading]]:px-4
                             [&_[cmdk-group-heading]]:py-1.5
                             [&_[cmdk-group-heading]]:text-[10px]
                             [&_[cmdk-group-heading]]:font-semibold
                             [&_[cmdk-group-heading]]:uppercase
                             [&_[cmdk-group-heading]]:tracking-[0.16em]
                             [&_[cmdk-group-heading]]:text-primary/35"
                >
                  {data!.occasions!.map((occasion) => (
                    <Command.Item
                      key={occasion.slug}
                      value={`occasion-${occasion.slug}-${occasion.name}`}
                      onSelect={() =>
                        handleSelect(
                          brandSlug
                            ? `/occasion/${occasion.slug}?brand=${brandSlug}`
                            : `/occasion/${occasion.slug}`,
                        )
                      }
                      className="mx-2 flex items-center gap-3 px-3 py-2.5 rounded-xl
                                 text-sm cursor-pointer select-none outline-none
                                 aria-selected:bg-[#EDE9E3] hover:bg-[#EDE9E3]
                                 data-[selected=true]:bg-[#EDE9E3]
                                 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/[0.07] flex items-center
                                      justify-center shrink-0">
                        <CalendarHeart className="h-3.5 w-3.5 text-primary/55" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-medium text-primary/85">{occasion.name}</span>
                        {brandName && (
                          <span className="text-[11px] text-primary/40 leading-tight">
                            from {brandName}
                          </span>
                        )}
                      </div>
                      <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-primary/25 shrink-0" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Brands */}
              {!isFetching && hasBrands && (
                <Command.Group
                  heading={t("nav.brands")}
                  className="[&_[cmdk-group-heading]]:px-4
                             [&_[cmdk-group-heading]]:py-1.5
                             [&_[cmdk-group-heading]]:text-[10px]
                             [&_[cmdk-group-heading]]:font-semibold
                             [&_[cmdk-group-heading]]:uppercase
                             [&_[cmdk-group-heading]]:tracking-[0.16em]
                             [&_[cmdk-group-heading]]:text-primary/35"
                >
                  {data!.brands.map((brand) => (
                    <Command.Item
                      key={brand.slug}
                      value={`brand-${brand.slug}-${brand.name}`}
                      onSelect={() => handleSelect(`/brand/${brand.slug}`)}
                      className="mx-2 flex items-center gap-3 px-3 py-2.5 rounded-xl
                                 text-sm cursor-pointer select-none outline-none
                                 aria-selected:bg-[#EDE9E3] hover:bg-[#EDE9E3]
                                 data-[selected=true]:bg-[#EDE9E3]
                                 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/[0.07] flex items-center
                                      justify-center shrink-0 overflow-hidden">
                        {brand.image ? (
                          <img
                            src={brand.image}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Store className="h-3.5 w-3.5 text-primary/55" />
                        )}
                      </div>
                      <span className="font-medium text-primary/85">{brand.name}</span>
                      <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-primary/25 shrink-0" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Products */}
              {!isFetching && hasProducts && (
                <Command.Group
                  heading={t("search.productsHeading")}
                  className="[&_[cmdk-group-heading]]:px-4
                             [&_[cmdk-group-heading]]:py-1.5
                             [&_[cmdk-group-heading]]:text-[10px]
                             [&_[cmdk-group-heading]]:font-semibold
                             [&_[cmdk-group-heading]]:uppercase
                             [&_[cmdk-group-heading]]:tracking-[0.16em]
                             [&_[cmdk-group-heading]]:text-primary/35"
                >
                  {data!.products.map((product) => (
                    <Command.Item
                      key={product.slug}
                      value={`product-${product.slug}-${product.name}`}
                      onSelect={() => handleSelect(`/product/${product.slug}`)}
                      className="mx-2 flex items-center gap-3.5 px-3 py-2.5 rounded-xl
                                 cursor-pointer select-none outline-none
                                 aria-selected:bg-[#EDE9E3] hover:bg-[#EDE9E3]
                                 data-[selected=true]:bg-[#EDE9E3]
                                 transition-colors"
                    >
                      {product.image?.uri ? (
                        <img
                          src={product.image.uri}
                          alt=""
                          className="h-14 w-14 rounded-xl object-cover shrink-0 bg-muted"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-primary/[0.06] shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="truncate text-sm font-medium text-primary/85">
                          {product.name}
                        </span>
                        <span className="text-xs text-primary/45 mt-0.5"><FormattedPrice usdValue={product.priceValue} /></span>
                      </div>
                      <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-primary/25 shrink-0" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
