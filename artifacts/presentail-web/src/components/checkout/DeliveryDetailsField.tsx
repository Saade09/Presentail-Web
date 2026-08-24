/**
 * DeliveryDetailsField — checkout Delivery Details free-text field with
 * landmark recognition backed by the Presentail OS Address Book.
 *
 * Behaviour contract (task 4649):
 *  - Typing ≥2 meaningful characters runs a debounced (300ms) search against
 *    the public /address-book/places/search endpoint. Responses are
 *    sequence-numbered so a stale response can never overwrite a newer one.
 *  - Suggestions render in a dropdown with a Verified badge and an
 *    always-present "Continue with '[typed]' as typed" row. The field
 *    converts to the compact verified-place card ONLY on explicit click/tap
 *    or Enter on a highlighted suggestion — never automatically.
 *  - No results / API failure / offline → no dropdown at all; the field
 *    stays a plain free-text textarea. Free-text entry never depends on the
 *    places API being up (the server returns an empty list while the
 *    OS_ADDRESS_BOOK_ENABLED flag is dark, so this component renders exactly
 *    the legacy textarea in production today).
 *  - The parent owns district/fee/slot reconciliation and the selected-place
 *    state; this component only reports explicit selection events.
 *
 * Analytics noise guard: while the feature flag is dark every search returns
 * empty, so search_performed / no_results events only fire once a search in
 * this browser session has returned at least one suggestion.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, CheckCircle2, MapPin } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { trackWebEvent } from "@/lib/analytics";
import { useLocale } from "@/contexts/LocaleContext";
import { CheckoutFieldError } from "./CheckoutField";

/** Public-safe verified place returned by /address-book/places/search. */
export type CheckoutPlace = {
  id: string;
  name: string;
  officialName: string | null;
  /** Approved public aliases (abbreviations, older names) — displayable. */
  aliases?: string[];
  area: string | null;
  districtName: string | null;
  districtCityId: string | null;
  districtCityName: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  verified: true;
  followUpQuestion: string | null;
  followUpPlaceholder: string | null;
};

export type PlaceDistrictNotice = {
  placeName: string;
  districtName: string;
};

type Props = {
  /** Free-text address value (recipient.address). */
  value: string;
  onChange: (value: string) => void;
  /** ISO2 delivery country — scopes the search. */
  countryCode: string;
  /** Currently selected verified place, or null for free-text mode. */
  selectedPlace: CheckoutPlace | null;
  /** Shopper's answer to the place follow-up question. */
  internalDetail: string;
  onInternalDetailChange: (value: string) => void;
  /**
   * Explicit selection of a suggestion. `typedQuery` is the text in the
   * field at selection time (persisted on the order + used by Change).
   */
  onSelectPlace: (place: CheckoutPlace, typedQuery: string) => void;
  /** Change action — return to free text. Parent restores `previousQuery`. */
  onClearPlace: () => void;
  /** "Delivery district updated" notice content, or null. Parent-owned. */
  districtNotice: PlaceDistrictNotice | null;
  addressError: boolean;
  detailError: boolean;
  invalidControlClass: string;
  isMobile: boolean;
};

/**
 * Flatten a selected place + the shopper's internal-location detail into the
 * legacy free-text address string, so downstream consumers that only read
 * `deliveryDetails`/`street` (WooCommerce, courier sheets, older OS views)
 * keep working with no schema knowledge of Address Book places.
 */
export function flattenPlaceAddress(place: CheckoutPlace, internalDetail: string): string {
  const namePart = place.officialName
    ? `${place.name} (${place.officialName})`
    : place.name;
  const areaPart = [place.area, place.districtCityName ?? place.districtName]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .filter((p, i, arr) => arr.findIndex((x) => x.toLowerCase() === p.toLowerCase()) === i)
    .join(", ");
  return [namePart, internalDetail.trim(), areaPart]
    .filter((p) => p.length > 0)
    .join(" — ");
}

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_CHARS = 2;

/**
 * Secondary line under the place name: the official name when OS sends one,
 * otherwise the approved aliases (the OS contract asks us to display both the
 * displayName and the approved aliases so shoppers recognise "AUB" → AUBMC).
 */
function placeSecondaryLine(place: CheckoutPlace): string | null {
  if (place.officialName) return place.officialName;
  const aliases = (place.aliases ?? [])
    .filter((a) => a.trim().length > 0 && a.trim().toLowerCase() !== place.name.trim().toLowerCase());
  return aliases.length > 0 ? aliases.join(", ") : null;
}

/**
 * True once a search in this browser session returned results — gates
 * search_performed/no_results analytics so the dark flag produces zero
 * event noise (module-scoped on purpose; survives component remounts).
 */
let sessionSawSuggestions = false;

export default function DeliveryDetailsField({
  value,
  onChange,
  countryCode,
  selectedPlace,
  internalDetail,
  onInternalDetailChange,
  onSelectPlace,
  onClearPlace,
  districtNotice,
  addressError,
  detailError,
  invalidControlClass,
  isMobile,
}: Props) {
  const { t } = useLocale();
  const listboxId = useId();

  const [suggestions, setSuggestions] = useState<CheckoutPlace[]>([]);
  const [open, setOpen] = useState(false);
  // -1 = nothing highlighted; suggestions.length = the "continue as typed" row
  const [activeIndex, setActiveIndex] = useState(-1);

  const seqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShownQueryRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // Debounced search with request sequencing (stale responses dropped).
  useEffect(() => {
    if (selectedPlace) return; // card mode — no searching
    const query = value.trim();
    if (query.length < MIN_QUERY_CHARS) {
      seqRef.current += 1; // invalidate any in-flight response
      setSuggestions([]);
      closeDropdown();
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const seq = ++seqRef.current;
      if (sessionSawSuggestions) {
        trackWebEvent({
          type: "landmark_search_performed",
          properties: { queryLength: query.length, country: countryCode },
        });
      }
      apiFetch<{ ok: boolean; places: CheckoutPlace[] }>(
        `/address-book/places/search?q=${encodeURIComponent(query)}&country=${encodeURIComponent(countryCode)}`,
      )
        .then((res) => {
          if (seq !== seqRef.current) return; // stale — a newer request exists
          const places = Array.isArray(res?.places) ? res.places : [];
          setSuggestions(places);
          setActiveIndex(-1);
          if (places.length > 0) {
            setOpen(true);
            sessionSawSuggestions = true;
            if (lastShownQueryRef.current !== query) {
              lastShownQueryRef.current = query;
              trackWebEvent({
                type: "landmark_suggestions_shown",
                properties: { count: places.length, queryLength: query.length },
              });
            }
          } else {
            // No results (or feature dark) → degrade to plain free text.
            setOpen(false);
            if (sessionSawSuggestions) {
              trackWebEvent({
                type: "landmark_search_no_results",
                properties: { queryLength: query.length, country: countryCode },
              });
            }
          }
        })
        .catch(() => {
          // Network/API failure — silently keep plain free-text entry.
          if (seq !== seqRef.current) return;
          setSuggestions([]);
          setOpen(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, countryCode, selectedPlace, closeDropdown]);

  // Close on click/tap outside the field + dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, closeDropdown]);

  const selectPlace = (place: CheckoutPlace) => {
    const typedQuery = value.trim();
    closeDropdown();
    setSuggestions([]);
    trackWebEvent({
      type: "landmark_suggestion_selected",
      properties: {
        placeId: place.id,
        placeName: place.name,
        district: place.districtCityName ?? place.districtName ?? undefined,
        queryLength: typedQuery.length,
      },
    });
    onSelectPlace(place, typedQuery);
  };

  const continueAsTyped = () => {
    closeDropdown();
    trackWebEvent({
      type: "landmark_continued_as_typed",
      properties: { queryLength: value.trim().length },
    });
  };

  const rowCount = suggestions.length + 1; // + continue-as-typed row

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % rowCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? rowCount - 1 : i - 1));
    } else if (e.key === "Enter") {
      // Enter converts ONLY when a suggestion is explicitly highlighted;
      // otherwise the textarea keeps its default newline behaviour.
      if (activeIndex >= 0) {
        e.preventDefault();
        if (activeIndex < suggestions.length) {
          selectPlace(suggestions[activeIndex]!);
        } else {
          continueAsTyped();
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
    }
  };

  // ── Verified-place card mode ──────────────────────────────────────────────
  if (selectedPlace) {
    const followUpLabel =
      selectedPlace.followUpQuestion ??
      t("checkout.places.whereInside", { place: selectedPlace.name });
    const followUpPlaceholder =
      selectedPlace.followUpPlaceholder ?? t("checkout.places.detailPh");
    const locationLine = [
      selectedPlace.area,
      selectedPlace.districtCityName ?? selectedPlace.districtName,
    ]
      .filter((part): part is string => !!part && part.trim().length > 0)
      .filter((part, idx, arr) => arr.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === idx)
      .join(", ");

    return (
      <div>
        {districtNotice && (
          <div
            className="mb-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"
            role="status"
            data-testid="notice-place-district-updated"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {t("checkout.places.districtUpdated", {
                place: districtNotice.placeName,
                district: districtNotice.districtName,
              })}
            </span>
          </div>
        )}

        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-3",
          )}
          data-testid="card-selected-place"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium leading-5" data-testid="text-selected-place-name">
                  {selectedPlace.name}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                  {t("checkout.places.verified")}
                </span>
              </div>
              {placeSecondaryLine(selectedPlace) && (
                <div className="mt-0.5 text-sm text-muted-foreground" data-testid="text-selected-place-official">
                  {placeSecondaryLine(selectedPlace)}
                </div>
              )}
              {locationLine && (
                <div className="mt-0.5 text-sm text-muted-foreground" data-testid="text-selected-place-location">
                  {locationLine}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClearPlace}
            className="shrink-0 text-sm font-medium text-primary underline underline-offset-2"
            aria-label={t("checkout.places.changeAria")}
            data-testid="button-change-place"
          >
            {t("checkout.places.change")}
          </button>
        </div>

        <div className="mt-4">
          <div className="mb-2 max-md:mb-1.5 flex items-center">
            <label htmlFor="place-internal-detail" className="text-sm font-medium leading-5">
              {followUpLabel}
              <span className="text-destructive ms-1">*</span>
            </label>
          </div>
          <Input
            id="place-internal-detail"
            value={internalDetail}
            onChange={(e) => onInternalDetailChange(e.target.value)}
            placeholder={followUpPlaceholder}
            className={cn(detailError && invalidControlClass)}
            aria-invalid={detailError || undefined}
            aria-describedby={detailError ? "place-internal-detail-error" : undefined}
            data-testid="input-place-internal-detail"
          />
          {detailError && (
            <CheckoutFieldError id="place-internal-detail-error" testId="error-place-internal-detail">
              {t("checkout.error.placeDetail")}
            </CheckoutFieldError>
          )}
        </div>
      </div>
    );
  }

  // ── Free-text mode with suggestion dropdown ───────────────────────────────
  return (
    <div ref={rootRef} className="relative">
      <Textarea
        ref={textareaRef}
        rows={isMobile ? 2 : 3}
        className={cn("min-h-[76px] max-md:min-h-[57px]", addressError && invalidControlClass)}
        aria-invalid={addressError || undefined}
        aria-describedby={addressError ? "recipient-address-error" : undefined}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isMobile ? t("checkout.addressPhShort") : t("checkout.addressPh")}
        data-testid="input-recipient-address"
      />

      {open && suggestions.length > 0 && (
        <div
          className="absolute start-0 end-0 top-full z-[90] mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
          data-testid="dropdown-place-suggestions"
        >
          <div className="px-3 pt-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("checkout.places.suggested")}
          </div>
          <ul id={listboxId} role="listbox" aria-label={t("checkout.places.listLabel")} className="pb-1">
            {suggestions.map((place, idx) => {
              const secondary = placeSecondaryLine(place);
              const line = [
                place.area,
                place.districtCityName ?? place.districtName,
              ]
                .filter((part): part is string => !!part && part.trim().length > 0)
                .filter((part, i, arr) => arr.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === i)
                .join(", ");
              return (
                <li
                  key={place.id}
                  id={`${listboxId}-option-${idx}`}
                  role="option"
                  aria-selected={activeIndex === idx}
                  className={cn(
                    "flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5 min-h-[46px]",
                    activeIndex === idx && "bg-accent",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectPlace(place)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  data-testid={`option-place-${place.id}`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium leading-5">{place.name}</div>
                    {secondary && (
                      <div className="truncate text-sm text-muted-foreground">{secondary}</div>
                    )}
                    {line && (
                      <div className="truncate text-sm text-muted-foreground">{line}</div>
                    )}
                  </div>
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                    {t("checkout.places.verified")}
                  </span>
                </li>
              );
            })}
            <li
              id={`${listboxId}-option-${suggestions.length}`}
              role="option"
              aria-selected={activeIndex === suggestions.length}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 border-t px-3 py-2.5 min-h-[46px] text-sm",
                activeIndex === suggestions.length && "bg-accent",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={continueAsTyped}
              onMouseEnter={() => setActiveIndex(suggestions.length)}
              data-testid="option-continue-as-typed"
            >
              <span className="truncate text-muted-foreground">
                {t("checkout.places.continueAsTyped", { query: value.trim() })}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
