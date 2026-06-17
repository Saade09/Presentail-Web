import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardNumberElement } from "@stripe/react-stripe-js";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidPhoneNumber } from "react-phone-number-input";
import { WebPhoneField } from "@/components/WebPhoneField";
import { Textarea } from "@/components/ui/textarea";
import { CARD_MESSAGE_KEY, CARD_TO_KEY, CARD_FROM_KEY, CARD_QR_LINK_KEY, COUPON_STORAGE_KEY } from "./Cart";
import {
  useCreateOrder,
  useDeliveryLocations,
  useStripeCheckoutSession,
  useMamoPayment,
  usePaypalPayment,
} from "@/lib/queries";
import { useCreateCheckoutPaymentIntent } from "@workspace/api-client-react";
import { StripeCardFields } from "@/components/StripeCardFields";
import { ArrowLeft, Check, MapPin, BookUser, ChevronDown, Tag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/contexts/LocaleContext";
import { Logo } from "@/components/Logo";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { FreeDeliveryBanner } from "@/components/cart/FreeDeliveryBanner";
import { FormattedPrice } from "@/components/FormattedPrice";
import { DeliveryDateRow } from "@/components/delivery/DeliveryDateRow";
import { DeliveryPickerModal, type DeliveryPickerSelection } from "@/components/delivery/DeliveryPickerModal";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import applePayLogo from "@/assets/payment-logos/applepay.svg";
import googlePayLogo from "@/assets/payment-logos/googlepay.svg";
import visaLogo from "@/assets/payment-logos/visa.svg";
import mastercardLogo from "@/assets/payment-logos/mastercard.svg";
import amexLogo from "@/assets/payment-logos/amex.svg";
import whishLogo from "@/assets/payment-logos/whish.svg";
import paypalLogo from "@/assets/payment-logos/paypal.svg";
import westernUnionLogo from "@/assets/payment-logos/western-union.svg";
import { CheckoutLoginDialog } from "@/components/cart/CheckoutLoginDialog";
import { CheckoutSkeleton } from "@/components/skeletons/CheckoutSkeleton";
import { trackEvent } from "@/lib/analytics";
import { trackFbEvent } from "@/lib/fbPixel";
import { useNow } from "@/lib/useNow";
import {
  dayLabels,
  expressSurchargeForCountry,
  firstAvailableDay,
  formatDeliveryRow,
  getCountryHour,
  isExpressDeliveryAvailable,
  slotTimeRangeForLabel,
  timeSlotsForCountry,
} from "@workspace/delivery";
import { ScheduleInlinePanel } from "@/components/product/ScheduleInlinePanel";
import {
  webNextPaymentMethod,
  webPaymentMethodLabelKey,
  webVisiblePayMethods,
  type WebPaymentMethodId,
} from "./checkoutPayMethods";
import { calcCheckoutFees, activeCurrencyForCountry } from "./checkoutFees";

// Maps known Stripe decline codes to plain-language, actionable messages.
// Returns null for unrecognised codes so the caller falls back to the
// generic message or the raw Stripe message.
function stripeDeclineMsg(
  error: { decline_code?: string | null; code?: string | null },
  t: (key: string) => string,
): string | null {
  const code = error.decline_code ?? error.code;
  if (code === "insufficient_funds") return t("checkout.stripe.declineInsufficientFunds");
  if (code === "card_velocity_exceeded") return t("checkout.stripe.declineVelocityExceeded");
  if (code === "do_not_honor") return t("checkout.stripe.declineDoNotHonor");
  if (code === "lost_card" || code === "stolen_card") return t("checkout.stripe.declineLostStolen");
  if (code === "expired_card") return t("checkout.stripe.declineExpiredCard");
  if (code === "incorrect_cvc") return t("checkout.stripe.declineIncorrectCvc");
  return null;
}

// Stripe publishable key — loaded once at module level so the Stripe.js
// script is only fetched once per page. `VITE_STRIPE_PUBLISHABLE_KEY` must
// be set as a Vite env variable for real card payments to work.
const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || null,
);

// The web checkout supports a subset of the shared payment-method catalog
// (no Western Union). All availability / label / fallback decisions go
// through the pure helpers in `./checkoutPayMethods`, which wrap the shared
// `@workspace/pay-methods` table and mirror the mobile checkout.
type PaymentMethodId = WebPaymentMethodId;

type SavedAddress = {
  id: number;
  label: string;
  nickname?: string | null;
  isDefault: boolean;
  countryCode?: string | null;
  district?: string | null;
  addressLine?: string | null;
  building?: string | null;
  apartment?: string | null;
  directions?: string | null;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  recipientPhone?: string | null;
  recipientPhoneCountryCode?: string | null;
};

function addressDisplayLabel(a: SavedAddress): string {
  const parts: string[] = [];
  if (a.nickname) parts.push(a.nickname);
  else parts.push(a.label.charAt(0).toUpperCase() + a.label.slice(1));
  if (a.district) parts.push(a.district);
  return parts.join(" · ");
}

function applyAddressToRecipient(
  a: SavedAddress,
  setRecipient: React.Dispatch<React.SetStateAction<{ firstName: string; lastName: string; phone: string; district: string; address: string; deliveryDate: string; cardMessage: string }>>,
  opts: { onlyEmpty?: boolean } = {},
) {
  const phone = [a.recipientPhoneCountryCode, a.recipientPhone].filter(Boolean).join("");
  const addressLine = [a.addressLine, a.building ? `Bldg: ${a.building}` : null, a.apartment ? `Apt: ${a.apartment}` : null]
    .filter(Boolean)
    .join(" · ");
  setRecipient((prev) => {
    // When onlyEmpty=true (auto-prefill path) we never overwrite a field the
    // shopper has already typed — we only fill in blank slots. When called
    // manually (picker click), we always apply the full address.
    const fill = (existing: string, fromAddress: string) =>
      opts.onlyEmpty ? existing || fromAddress : fromAddress || existing;
    return {
      ...prev,
      firstName: fill(prev.firstName, a.recipientFirstName ?? ""),
      lastName: fill(prev.lastName, a.recipientLastName ?? ""),
      phone: fill(prev.phone, phone),
      district: fill(prev.district, a.district ?? ""),
      address: fill(prev.address, addressLine),
    };
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const PENDING_ORDER_KEY = "presentail_pending_order_v1";

// Typed shape of the /api/woo/order response. The generated hook uses `any`,
// so we narrow it here to avoid `as any` casts in the order-handling code.
type CreateOrderResponse =
  | { ok: true; wcOrderId: number | null; osOrderId?: string | null; orderKey?: string; couponDiscount: number }
  | { ok: false; message?: string; code?: string; queued?: boolean };

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const { items, subtotal, clearCart, itemCount, isHydrated } = useCart();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  // Mirror the cart-button gate for direct visits to /checkout: signed-out
  // shoppers see the same dismissible login prompt; dismissing returns them
  // to the cart with no state lost. Suppressed once they've explicitly
  // chosen "Checkout as Guest" so they're not re-prompted on every render.
  // The cart's guest button forwards `?guest=1` so we don't double-prompt
  // when transitioning from the cart-side dialog to /checkout.
  const [guestAcked, setGuestAcked] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("guest") === "1";
  });
  const showLoginGate = !authLoading && !user && !guestAcked;
  const { toast } = useToast();
  const { t, dir, cityName } = useLocale();
  const { countryCode, country, city: locationCity } = useLocationSelection();
  const { currencyCode } = useDisplayCurrency();
  const createOrder = useCreateOrder();
  const stripeSession = useStripeCheckoutSession();
  const createPaymentIntent = useCreateCheckoutPaymentIntent();
  const mamoPayment = useMamoPayment();
  const paypalPayment = usePaypalPayment();
  const { data: locations, isLoading: locationsLoading } = useDeliveryLocations();
  const [stripeCardError, setStripeCardError] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [orderNote, setOrderNote] = useState("");

  // Saved addresses for signed-in shoppers
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const defaultAddressAppliedRef = useRef(false);

  // Seed `recipient.deliveryDate` from the shared delivery-selection
  // store so a window the shopper picked from the product page lands
  // in the checkout date input on first render. The same store is the
  // single source of truth — `useDeliverySelection()` is called below
  // for the mode/slot seeds.
  const seededDeliverySelection = useDeliverySelection();
  const [qrLink] = useState(() => {
    try { return localStorage.getItem(CARD_QR_LINK_KEY) ?? ""; } catch { return ""; }
  });

  const [recipient, setRecipient] = useState({
    firstName: (() => { try { return localStorage.getItem(CARD_TO_KEY) ?? ""; } catch { return ""; } })(),
    lastName: "",
    phone: "",
    district: locationCity?.name ?? "",
    address: "",
    deliveryDate:
      seededDeliverySelection.date && seededDeliverySelection.mode !== "express"
        ? seededDeliverySelection.date
        : "",
    cardMessage: (() => { try { return localStorage.getItem(CARD_MESSAGE_KEY) ?? ""; } catch { return ""; } })(),
  });

  const [sender, setSender] = useState({
    firstName: user?.firstName || (() => { try { return localStorage.getItem(CARD_FROM_KEY) ?? ""; } catch { return ""; } })(),
    lastName: user?.lastName || "",
    email: user?.email || "",
    phone: user?.phone || "",
  });

  // Signed-in shoppers already gave us their identity at signup, so we
  // hide the sender Name/Email inputs and only keep the WhatsApp field
  // visible when the profile has no phone yet (so we can ask once and
  // persist it back to the account). `hadProfilePhoneOnMountRef` is
  // captured once so post-order we can decide whether to PUT the typed
  // phone back to the profile — re-reading `user.phone` after a save
  // would flip the flag and we'd skip future saves incorrectly.
  const isSignedIn = !!user;
  const profilePhone = (user?.phone ?? "").trim();
  const hasProfilePhone = isSignedIn && profilePhone.length > 0;
  const hadProfilePhoneOnMountRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!user) return;
    if (hadProfilePhoneOnMountRef.current === null) {
      hadProfilePhoneOnMountRef.current = profilePhone.length > 0;
    }
    // Keep sender state in sync if the auth user resolves after mount
    // (e.g. cookie hydration races the first render). We never overwrite
    // a value the shopper already typed.
    setSender((prev) => ({
      firstName: prev.firstName || user.firstName || "",
      lastName: prev.lastName || user.lastName || "",
      email: prev.email || user.email || "",
      phone: prev.phone || user.phone || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch saved addresses for signed-in shoppers so we can offer pre-fill.
  // Silently no-ops for guests — the addresses endpoint returns 401 which
  // we swallow here. Pre-fill fires exactly once per checkout session (guarded
  // by `defaultAddressAppliedRef`) and only if the shopper hasn't already
  // typed something into the recipient fields.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch<{ ok: boolean; addresses: SavedAddress[] }>("/me/addresses")
      .then((r) => {
        if (cancelled) return;
        const addrs = r.addresses ?? [];
        setSavedAddresses(addrs);
        if (!defaultAddressAppliedRef.current) {
          defaultAddressAppliedRef.current = true;
          const def = addrs.find((a) => a.isDefault) ?? addrs[0];
          if (def) applyAddressToRecipient(def, setRecipient, { onlyEmpty: true });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Best-effort: save the typed delivery address to the shopper's profile
  // when they've toggled "Save this address" and are signed in. Never
  // blocks the order flow — failures are silently swallowed.
  const maybeSaveNewAddress = async () => {
    if (!isSignedIn || !saveAddress || noAddress) return;
    const district = recipient.district.trim();
    const addressLine = recipient.address.trim();
    if (!district || !addressLine) return;
    const cc = (countryCode ?? "LB").toUpperCase().slice(0, 2);
    try {
      await apiFetch("/me/addresses", {
        method: "POST",
        body: JSON.stringify({
          label: "home",
          countryCode: cc,
          district,
          addressLine,
          building: null,
          apartment: null,
          directions: null,
          nickname: null,
          recipientFirstName: recipient.firstName.trim() || null,
          recipientLastName: recipient.lastName.trim() || null,
          recipientPhone: recipient.phone.trim() || null,
          recipientPhoneCountryCode: null,
          isDefault: false,
        }),
      });
    } catch {
      // best-effort — never block the order
    }
  };

  // Best-effort: persist the typed WhatsApp number to the profile when
  // a signed-in shopper had no phone on file before this checkout. Never
  // blocks the order flow — failures are logged and swallowed.
  const maybeSaveProfilePhone = async () => {
    if (!isSignedIn) return;
    if (hadProfilePhoneOnMountRef.current !== false) return;
    const phoneToSave = sender.phone.trim();
    if (!phoneToSave) return;
    try {
      await apiFetch("/auth/me", {
        method: "PUT",
        body: JSON.stringify({ phone: phoneToSave }),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[checkout] post-order phone save failed", err);
    }
  };

  const deliverySelection = seededDeliverySelection;
  // Seed the in-checkout date/slot/mode from the shared delivery-selection
  // store so a window the shopper picked from the product page survives
  // into the checkout summary. Falls back to "schedule" + the first slot
  // when there's no persisted choice (legacy behaviour).
  const persistedScheduleMode =
    deliverySelection.mode && deliverySelection.mode !== "express"
      ? "schedule"
      : deliverySelection.mode === "express"
        ? "express"
        : "schedule";
  const [deliverySlot, setDeliverySlot] = useState<string>(
    deliverySelection.slotLabel ?? timeSlotsForCountry(countryCode)[0]?.label ?? "",
  );
  const [deliveryMode, setDeliveryMode] = useState<"express" | "schedule">(
    persistedScheduleMode,
  );
  const [paymentMethod, setPaymentMethodState] = useState<PaymentMethodId>("apple_pay");
  // Tracks whether the Stripe PaymentRequest probe confirmed a wallet (Apple Pay /
  // Google Pay) is available on this browser. Starts true (rows visible while probe
  // is pending), flipped to false when probe resolves as unsupported so the rows
  // are hidden and the shopper can't manually re-select an unavailable method.
  const [walletSupported, setWalletSupported] = useState(true);
  // Wrap the setter so user-driven payment-method picks emit a funnel
  // event. We deliberately do NOT instrument the auto-fallback effect
  // below (e.g. AE customers being switched off whish) so the funnel
  // reflects shopper intent, not server-driven correction.
  const setPaymentMethod = (m: PaymentMethodId) => {
    setPaymentMethodState((prev) => {
      if (prev !== m) {
        trackEvent({
          name: "payment_method_selected",
          surface: "checkout",
          action: m,
        });
      }
      return m;
    });
  };
  const [noAddress, setNoAddress] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [identitySecret, setIdentitySecret] = useState(false);
  const [phoneSubmitAttempted, setPhoneSubmitAttempted] = useState(false);
  const [deliveryPickerOpen, setDeliveryPickerOpen] = useState(false);

  // Coupon / gift card — seeded from localStorage so a code entered on the
  // cart page survives the cart → checkout navigation without re-entry.
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState(() => {
    try { return localStorage.getItem(COUPON_STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [couponApplied, setCouponApplied] = useState(() => {
    try { return (localStorage.getItem(COUPON_STORAGE_KEY) ?? "").length > 0; } catch { return false; }
  });
  // Inline error shown below the coupon input when the order fails due to an
  // invalid/expired coupon code. Cleared when the shopper edits or re-applies.
  const [couponError, setCouponError] = useState<string | null>(null);
  // Discount amount confirmed by WC after order creation (display currency).
  // Zero until WC responds; populated in finalizeOrderNow so the summary can
  // show the actual deduction before the success-page redirect.
  const [confirmedCouponDiscount, setConfirmedCouponDiscount] = useState(0);
  const [cardProcessing, setCardProcessing] = useState(false);
  const couponInputRef = useRef<HTMLInputElement>(null);

  const handleCouponApply = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    try { localStorage.setItem(COUPON_STORAGE_KEY, code); } catch { /* best-effort */ }
    setCouponInput(code);
    setCouponApplied(true);
    setCouponError(null);
  };

  const handleCouponRemove = () => {
    try { localStorage.removeItem(COUPON_STORAGE_KEY); } catch { /* best-effort */ }
    setCouponInput("");
    setCouponApplied(false);
    setCouponOpen(false);
    setCouponError(null);
  };

  const handleCouponToggle = () => {
    const next = !couponOpen;
    setCouponOpen(next);
    if (next) {
      setTimeout(() => couponInputRef.current?.focus(), 80);
    }
  };

  // Sync confirmed selection from the in-summary picker into checkout's
  // local state. Called synchronously by DeliveryPickerModal.handleConfirm
  // before the modal closes, so the confirmed values are available immediately
  // and totals / deliveryRowText update on the same render cycle.
  const handleDeliveryPickerConfirm = (sel: DeliveryPickerSelection) => {
    if (sel.mode === "express") {
      setDeliveryMode("express");
    } else {
      setDeliveryMode("schedule");
      if (sel.date) setRecipient((r) => ({ ...r, deliveryDate: sel.date }));
      if (sel.slotLabel) setDeliverySlot(sel.slotLabel);
    }
  };

  // All cities for the selected country (both active and inactive) — sourced
  // from the OS cache so toggling a city in Presentail OS propagates within
  // the polling interval. Inactive cities are shown greyed-out and unclickable;
  // only active cities (isActive !== false) can be selected.
  const activeCities = useMemo(
    () =>
      locations?.countries.find((c) => c.code === countryCode)?.cities ?? [],
    [locations, countryCode],
  );

  // Pre-compute the selected city so we can read its OS express flag below.
  // Only active cities are eligible for selection, so we restrict the lookup.
  const selectedCityData = useMemo(() => {
    const active = activeCities.filter((c) => c.isActive !== false);
    return active.find(
      (c) => c.name === (recipient.district || active[0]?.name || ""),
    );
  }, [activeCities, recipient.district]);

  // Express Delivery (1–3 hrs) is offered only between 8 AM and 10 PM in
  // the recipient country's local time, mirroring the mobile rule. Also
  // gated by the OS per-city `expressAvailable` flag — when the OS marks
  // a city as express-unavailable the button is disabled regardless of time.
  // When no longer available we silently fall back to the scheduled flow
  // so the order can still be placed. `useNow` ticks every minute so the
  // computed availability flips automatically when the cutoff passes
  // mid-session, even without an unrelated re-render.
  const now = useNow();
  const expressAvailable = useMemo(() => {
    const timeOk = isExpressDeliveryAvailable(countryCode, now);
    // Use `=== true` so a null/missing city (data not yet loaded, or OS
    // hasn't set the flag) defaults to false — prevents showing express for
    // cities where OS has disabled it before the query resolves.
    const cityOk = selectedCityData?.expressAvailable === true;
    return timeOk && cityOk;
  }, [countryCode, now, selectedCityData]);
  const expressSurcharge = expressSurchargeForCountry(countryCode);

  // Use OS city time slots when available; fall back to hardcoded per-country defaults.
  // `selectedCityData?.timeSlots` is populated from /api/delivery-locations once loaded.
  const timeSlots = useMemo(
    () =>
      selectedCityData?.timeSlots?.length
        ? selectedCityData.timeSlots
        : timeSlotsForCountry(countryCode),
    [selectedCityData, countryCode],
  );

  useEffect(() => {
    if (deliveryMode === "express" && !expressAvailable) {
      setDeliveryMode("schedule");
    }
  }, [deliveryMode, expressAvailable]);

  // Emit exactly one checkout_started event per checkout mount, but only
  // after auth has resolved AND the shopper is allowed past the login
  // gate (signed in or explicitly continuing as guest). Without the
  // `authLoading` guard the effect would fire during the brief loading
  // window — when `showLoginGate` is still false because `user` hasn't
  // hydrated yet — and double-count signed-out shoppers who then bounce
  // off the prompt, corrupting the cart→checkout ratio. The ref makes
  // the emission idempotent across the auth-loading → resolved
  // transition.
  const checkoutStartedRef = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (showLoginGate) return;
    if (checkoutStartedRef.current) return;
    checkoutStartedRef.current = true;
    trackEvent({ name: "checkout_started", surface: "checkout" });
    trackFbEvent("InitiateCheckout");
  }, [authLoading, showLoginGate]);

  // Reflect any in-checkout edits to the delivery mode / date / slot back
  // into the shared delivery-selection store so the next surface (cart,
  // product page, support tools that read the same key) stays in sync.
  // The first render is intentionally skipped — otherwise just visiting
  // checkout would persist a "default" schedule selection that the
  // shopper never explicitly chose, polluting the product page and cart
  // for subsequent visits.
  const didSyncDeliveryRef = useRef(false);
  useEffect(() => {
    if (!didSyncDeliveryRef.current) {
      didSyncDeliveryRef.current = true;
      return;
    }
    const mode: "express" | "today_slot" | "schedule" =
      deliveryMode === "express"
        ? "express"
        : recipient.deliveryDate &&
            recipient.deliveryDate === new Date().toISOString().slice(0, 10)
          ? "today_slot"
          : "schedule";
    deliverySelection.setSelection({
      mode,
      date:
        deliveryMode === "express"
          ? new Date().toISOString().slice(0, 10)
          : recipient.deliveryDate || null,
      slotLabel: deliveryMode === "express" ? null : deliverySlot || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMode, deliverySlot, recipient.deliveryDate]);

  const prevCountryRef = useRef(countryCode);
  useEffect(() => {
    if (countryCode !== prevCountryRef.current) {
      prevCountryRef.current = countryCode;
      setRecipient((r) => ({ ...r, district: "" }));
      // Use city OS slots when already loaded, otherwise fall back to hardcoded.
      const newSlots = selectedCityData?.timeSlots?.length
        ? selectedCityData.timeSlots
        : timeSlotsForCountry(countryCode);
      setDeliverySlot(newSlots[0]?.label ?? "");
    }
  }, [countryCode]);

  // Clear a pre-populated district when OS marks that city inactive (e.g. a
  // saved address was stored before the city was deactivated, or the location
  // context passed in an inactive city on mount).  Runs whenever activeCities
  // updates so the picker cannot silently hold an unavailable city.
  useEffect(() => {
    if (!activeCities.length) return;
    setRecipient((r) => {
      if (!r.district) return r;
      const match = activeCities.find((c) => c.name === r.district);
      if (match && match.isActive === false) return { ...r, district: "" };
      return r;
    });
  }, [activeCities]);

  // Country-aware mount-time correction: when the selected date is today (or
  // absent) and today has no remaining slots for this country, advance to the
  // first available day.  Runs whenever timeSlots updates (e.g. OS city data
  // arrives after the initial render), but only corrects toward a later date —
  // it never moves a future date backward.
  const deliveryDayInitRef = useRef(false);
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const currentDate = recipient.deliveryDate;
    // Only correct when the current date is today or not yet set.
    if (currentDate && currentDate !== today) return;
    // Skip if already corrected and nothing has changed.
    if (deliveryDayInitRef.current && currentDate && currentDate !== today) return;
    deliveryDayInitRef.current = true;
    const h = getCountryHour(countryCode, new Date());
    const todayHasSlots = timeSlots.some((s) => s.cutoffHour > h);
    if (todayHasSlots) {
      // Today still has available slots — ensure the pre-selected slot is the
      // first one that hasn't yet passed its cutoff.
      const firstAvailableSlot = timeSlots.find((s) => s.cutoffHour > h);
      if (firstAvailableSlot && !deliverySlot) {
        setDeliverySlot(firstAvailableSlot.label);
      }
      return;
    }
    // Today is fully sold out — advance to the first available future day.
    const result = firstAvailableDay(today, timeSlots, h, today);
    if (result) {
      setRecipient((r) => ({ ...r, deliveryDate: result.iso }));
      setDeliverySlot(result.slot.label);
      if (result.iso !== today) setDeliveryMode("schedule");
      // Persist the corrected selection so the product page / cart stay in sync.
      deliverySelection.setSelection({
        mode: result.iso !== today ? "schedule" : "today_slot",
        date: result.iso,
        slotLabel: result.slot.label,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeSlots]);

  // These hooks must be called unconditionally — before any early return — to
  // comply with React's Rules of Hooks. Moving them here prevents a hooks-count
  // mismatch when showLoginGate flips or the cart hydrates from localStorage.
  const summaryDays = useMemo(
    () => dayLabels(t("checkout.day.today"), t("checkout.day.tomorrow")),
    [t],
  );
  const payCtxCountry = countryCode ?? undefined;
  const paymentOptions = useMemo(() => {
    const ids = webVisiblePayMethods({
      activeCurrency: currencyCode,
      countryCode: payCtxCountry,
    }).filter((id) => {
      if (id === "apple_pay" || id === "google_pay") return walletSupported;
      return true;
    });
    return ids.map((id) => ({
      id,
      labelKey: webPaymentMethodLabelKey(id, currencyCode),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencyCode, countryCode, walletSupported]);
  // If the currently selected payment method is no longer available for
  // the active currency / country, re-select a sensible default through
  // the same shared helper the mobile checkout uses.
  useEffect(() => {
    const fallback = webNextPaymentMethod(paymentMethod, {
      activeCurrency: currencyCode,
      countryCode: payCtxCountry,
    });
    if (fallback !== paymentMethod) setPaymentMethodState(fallback);
  }, [currencyCode, countryCode, paymentMethod]);

  // Stripe PaymentRequest object reused for both the canMakePayment probe
  // and the actual wallet submit (non-AED). Stored after canMakePayment()
  // confirms support so it can be shown synchronously from handleSubmit.
  const paymentRequestRef = useRef<import("@stripe/stripe-js").PaymentRequest | null>(null);

  // Probe wallet (Apple Pay / Google Pay) availability via Stripe's
  // PaymentRequest API. Runs once when the Stripe.js instance resolves.
  // If the browser / device reports no wallet is configured, silently
  // advance the selection to the next supported method so the shopper
  // is never stuck on a tile that would fail at submission.
  const walletCheckedRef = useRef(false);
  useEffect(() => {
    if (!stripe || walletCheckedRef.current) return;
    walletCheckedRef.current = true;
    // Use "US" for the probe — it is always a valid Stripe PaymentRequest country.
    // The probe only checks whether this browser/device has a wallet configured
    // (Apple Pay in Safari, Google Pay in Chrome, etc.). The country parameter
    // here does not need to match the shopper's delivery country.
    let pr: import("@stripe/stripe-js").PaymentRequest;
    try {
      pr = stripe.paymentRequest({
        country: "US",
        currency: "usd",
        total: { label: "Presentail", amount: 100 }, // i18n-ignore — probe amount, updated at submit
        requestPayerName: false,
        requestPayerEmail: false,
      });
    } catch {
      // paymentRequest() itself failed (extremely rare) — leave rows visible
      // so the shopper can still attempt to pay via other methods.
      return;
    }
    pr.canMakePayment().then((result) => {
      if (result) {
        // Browser has a wallet configured (Apple Pay / Google Pay).
        // Store the PR object so handleSubmit can call pr.show() synchronously.
        paymentRequestRef.current = pr;
      } else {
        // Browser reported no wallet available — hide the rows and advance the
        // selection so the shopper is never left on a tile that would fail.
        //   • AED  → mamo  (Stripe doesn't settle AED; Mamo is the card option)
        //   • else → card  (Stripe settles all other supported currencies)
        setWalletSupported(false);
        setPaymentMethodState((current) => {
          if (current !== "apple_pay" && current !== "google_pay") return current;
          return currencyCode === "AED" ? "mamo" : "card";
        });
      }
    }).catch(() => {
      // Ignore errors (e.g. Stripe not fully initialised yet).
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);

  if (showLoginGate) {
    return (
      <>
        <CheckoutSkeleton />
        <CheckoutLoginDialog
          open
          onOpenChange={(open) => {
            if (!open) setLocation("/cart");
          }}
          onContinueAsGuest={() => setGuestAcked(true)}
          surface="checkout-direct"
        />
      </>
    );
  }

  if (isHydrated && itemCount === 0) {
    return (
      <div className="min-h-screen pt-32 pb-24 text-center">
        <h1 className="text-3xl font-serif mb-4">{t("checkout.empty.title")}</h1>
        <Button asChild data-testid="button-back-to-shop"><Link href="/shop">{t("checkout.empty.cta")}</Link></Button>
      </div>
    );
  }

  const currentCountryCities = activeCities;
  const firstActiveCity = currentCountryCities.find((c) => c.isActive !== false);
  const hasActiveCities = firstActiveCity !== undefined;
  const _selectedDistrict = recipient.district || firstActiveCity?.name || "";
  // Per-city fees and free-delivery rules come from the OS cache (via
  // /api/delivery-locations) so changes in Presentail OS propagate within
  // the polling interval. The OS threshold/enabled flag override the
  // hardcoded per-country defaults in checkoutFees.ts.
  const selectedCity = selectedCityData;
  // City-level free-delivery settings take precedence over country-level.
  // selectedCity comes from the OS cache via /api/delivery-locations and
  // now carries per-city freeDeliveryThresholdUsd / freeDeliveryEnabled.
  const osCountryData = locations?.countries.find((c) => c.code === countryCode);
  // Effective threshold/enabled for the currently selected city — used both
  // for fee calculation and for the FreeDeliveryBanner in the order summary.
  const effectiveFreeDeliveryThresholdUsd =
    selectedCity?.freeDeliveryThresholdUsd ?? osCountryData?.freeDeliveryThresholdUsd;
  const effectiveFreeDeliveryEnabled =
    selectedCity?.freeDeliveryEnabled ?? osCountryData?.freeDeliveryEnabled;
  const { districtFee, expressFee, slotFee, total } = calcCheckoutFees({
    subtotal,
    countryCode: countryCode ?? "LB",
    noAddress,
    cityFee: selectedCity?.fee ?? 0,
    deliveryMode,
    timeSlots,
    deliverySlot,
    freeDeliveryThresholdUsd: effectiveFreeDeliveryThresholdUsd,
    freeDeliveryEnabled: effectiveFreeDeliveryEnabled,
  });

  // Build a "Today · 2:00 PM – 6:00 PM" / "Wed 13 · …" / "Express Delivery"
  // line for the order summary so the shopper can confirm their pick at a
  // glance before paying — mirrors the mobile checkout summary.
  // NOTE: summaryDays is computed above (before early returns) to satisfy Rules of Hooks.
  let deliveryRowText: string | null = null;
  try {
    deliveryRowText = formatDeliveryRow({
      mode: deliveryMode,
      date: recipient.deliveryDate,
      slotLabel: deliverySlot,
      slotTimeRange: slotTimeRangeForLabel(deliverySlot, timeSlots),
      days: summaryDays,
      expressLabel: t("checkout.expressDeliveryLabel"),
    });
  } catch {
    // safe fallback — delivery row will show the picker affordance
  }
  const isProcessing =
    createOrder.isPending ||
    stripeSession.isPending ||
    createPaymentIntent.isPending ||
    mamoPayment.isPending ||
    paypalPayment.isPending ||
    cardProcessing;

  // Active display currency derived from the active country. Used both
  // by the payment-method picker (to hide unavailable methods) and by
  // the submit handler (to route AED + wallet through Mamo's hosted page,
  // mirroring mobile checkout).
  const activeCurrency = activeCurrencyForCountry(countryCode ?? "LB");

  // orderId is generated once per checkout attempt and threaded through the
  // payment session creation AND the WC order payload so the server can bind
  // them together and reject any replay of a paid session for a different order.
  const buildOrderPayload = (
    overrides: {
      paymentRef?: string;
      orderId?: string;
      paymentMethod?: PaymentMethodId;
    } = {},
  ) => ({
    orderId: overrides.orderId ?? `WEB-${Math.floor(100000 + Math.random() * 900000)}`,
    items: items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      price: i.product.priceValue,
      wcId: i.product.wcId,
      osSlug: i.product.id,
    })),
    billing: {
      firstName: sender.firstName,
      lastName: sender.lastName,
      email: sender.email,
      phone: sender.phone,
    },
    recipient: {
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      phone: recipient.phone,
    },
    district: recipient.district,
    districtFee: districtFee,
    expressFee,
    slotFee,
    cityId: selectedCityData?.id != null ? String(selectedCityData.id) : undefined,
    noAddress,
    deliveryDetails: noAddress ? "To be confirmed" : recipient.address,
    deliveryDate: deliveryMode === "express" ? todayIso() : recipient.deliveryDate,
    deliverySlot: deliveryMode === "express" ? t("checkout.expressDeliveryLabel") : deliverySlot,
    deliverySlotTime: deliveryMode === "express" ? undefined : slotTimeRangeForLabel(deliverySlot, timeSlots),
    cardMessage: recipient.cardMessage,
    ...(/^https?:\/\/.+/.test(qrLink.trim()) ? { qrLink: qrLink.trim() } : {}),
    // "apple_pay" / "google_pay" are client-side UX IDs; the API server and
    // WooCommerce only recognise the legacy "wallet" value for both.
    paymentMethod: (() => {
      const m = overrides.paymentMethod ?? paymentMethod;
      return m === "apple_pay" || m === "google_pay" ? "wallet" : m;
    })(),
    identitySecret,
    currencyCode: "USD",
    totalUsd: total,
    shippingCountry: (countryCode ?? "LB").toUpperCase().slice(0, 2),
    ...(couponApplied && couponInput.trim() ? { couponCode: couponInput.trim() } : {}),
    ...(overrides.paymentRef ? { paymentRef: overrides.paymentRef } : {}),
  });

  const finalizeOrderNow = async (paymentRef?: string) => {
    const payload = buildOrderPayload({ paymentRef });
    const res = (await createOrder.mutateAsync(payload)) as CreateOrderResponse;
    if (res.ok) {
      // Update the confirmed discount in state so the summary briefly shows
      // the deduction before the redirect (and WC returns it in the response).
      if (res.couponDiscount > 0) setConfirmedCouponDiscount(res.couponDiscount);
      clearCart();
      // Clear the coupon code after a successful order so it doesn't
      // persist into the next checkout session.
      try { localStorage.removeItem(COUPON_STORAGE_KEY); } catch { /* best-effort */ }
      // Fire-and-forget — runs after the order is confirmed in WC so a
      // profile-update failure never blocks order completion.
      void maybeSaveProfilePhone();
      trackEvent({
        name: "order_placed",
        surface: "checkout",
        action: paymentMethod,
      });
      try {
        sessionStorage.setItem(
          PENDING_ORDER_KEY,
          JSON.stringify({ payload, createdAt: Date.now() }),
        );
      } catch { /* best-effort */ }
      setLocation(`/order-confirmed?status=success&ref=${payload.orderId}`);
    } else if (res.code === "coupon_invalid") {
      // Coupon-specific error: surface inline below the coupon field (using
      // WC's specific message when available) so the shopper can correct the
      // code without dismissing a generic toast.
      setCouponError(res.message || t("checkout.coupon.invalidError"));
      setCouponApplied(false);
      setCouponOpen(true);
      setTimeout(() => couponInputRef.current?.focus(), 80);
    } else {
      toast({ title: t("checkout.toast.failTitle"), description: res.message || t("checkout.toast.failGeneric"), variant: "destructive" });
    }
  };

  // Stash the order payload to sessionStorage so the post-redirect page can
  // finalize the WC order using the SAME orderId that was bound to the payment
  // session. Passing orderId here ensures the paymentRef↔orderId binding
  // created by the server during session creation is preserved end-to-end.
  const stashAndRedirect = (
    url: string,
    orderId: string,
    paymentMethodOverride?: PaymentMethodId,
  ) => {
    const payload = buildOrderPayload({
      orderId,
      paymentMethod: paymentMethodOverride,
    });
    // Guard against QuotaExceededError (Safari private mode, full storage).
    // If we can't stash the pending order we must NOT redirect — the shopper
    // would pay but OrderConfirmed would find nothing and show "failed".
    try {
      sessionStorage.setItem(
        PENDING_ORDER_KEY,
        JSON.stringify({ payload, createdAt: Date.now() }),
      );
    } catch {
      toast({
        title: t("checkout.toast.failTitle"),
        description: t("checkout.toast.storageError"),
        variant: "destructive",
      });
      return;
    }
    // Note: we do NOT persist the typed phone to the profile here. The
    // order isn't placed yet — it gets finalized after the shopper
    // returns from the hosted payment page — and saving the phone on a
    // payment that ends up abandoned would silently mutate the profile.
    // For hosted-payment flows the phone is only saved on a future
    // checkout that finalizes via `finalizeOrderNow`.
    window.location.href = url;
  };

  const handleSubmit = async () => {
    try {
      // Fire-and-forget before any redirect so the address is saved even
      // for hosted-payment flows where we never return to this page.
      void maybeSaveNewAddress();

      const origin = window.location.origin;
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const _successUrl = `${origin}${base}/order-confirmed?status=success&pid={CHECKOUT_SESSION_ID}`;
      const _cancelUrl = `${origin}${base}/order-confirmed?status=failed`;
      const returnUrl = `${origin}${base}/order-confirmed?status=success`;
      const failureUrl = `${origin}${base}/order-confirmed?status=failed`;

      // Generate orderId ONCE and pass it to the payment endpoint AND the
      // order payload so both sides reference the same order ID.
      const orderId = `WEB-${Math.floor(100000 + Math.random() * 900000)}`;

      // For non-AED wallet: the Stripe Payment Request flow is used when
      // paymentRequestRef holds the probe-confirmed PR object. If the probe
      // hasn't resolved yet (rare race before submit), fall back to card.
      const isWalletMethod = paymentMethod === "apple_pay" || paymentMethod === "google_pay";
      const walletViaNativeSheet =
        isWalletMethod &&
        activeCurrency !== "AED" &&
        paymentRequestRef.current !== null;

      // Resolve effective method used for the non-wallet submit branches below.
      const payMethod: PaymentMethodId =
        isWalletMethod && activeCurrency !== "AED" && !walletViaNativeSheet
          ? "card"
          : paymentMethod;

      if (walletViaNativeSheet && stripe) {
        const pr = paymentRequestRef.current!;

        // Update the displayed total before opening the native sheet so the
        // shopper sees the correct order amount (amount is in USD cents).
        pr.update({ total: { label: t("checkout.payment.orderTitle"), amount: Math.round(total * 100) } });

        // pr.show() MUST be called synchronously from the click-handler
        // context. Await below is inside the paymentmethod callback, not here.
        pr.show();

        await new Promise<void>((resolve) => {
          const cleanup = () => {
            pr.off("paymentmethod", pmHandler);
            pr.off("cancel", cancelHandler);
          };

          const cancelHandler = () => { cleanup(); resolve(); };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pmHandler = async (ev: any) => {
            cleanup();
            try {
              const intentRes = await createPaymentIntent.mutateAsync({
                data: {
                  items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
                  orderId,
                  currency: "USD",
                  email: sender.email || undefined,
                  deliveryFeeUsd: districtFee + expressFee + slotFee,
                  district: recipient.district,
                  expressDelivery: deliveryMode === "express",
                  noAddress,
                },
              });

              if (!intentRes.ok || !intentRes.clientSecret) {
                ev.complete("fail");
                setStripeCardError((intentRes as { message?: string }).message || t("checkout.toast.cardUnavailableDesc"));
                resolve();
                return;
              }

              const { error: stripeError, paymentIntent: confirmedIntent } =
                await stripe.confirmCardPayment(
                  intentRes.clientSecret,
                  { payment_method: ev.paymentMethod.id },
                  { handleActions: false },
                );

              if (stripeError) {
                ev.complete("fail");
                trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: stripeError.code ?? undefined });
                setStripeCardError(stripeDeclineMsg(stripeError, t) ?? stripeError.message ?? t("checkout.toast.cardPaymentFailed"));
                resolve();
                return;
              }

              let finalIntent: import("@stripe/stripe-js").PaymentIntent | undefined = confirmedIntent ?? undefined;
              if (confirmedIntent?.status === "requires_action") {
                const { error: actionError, paymentIntent: actionIntent } = await stripe.handleNextAction({
                  clientSecret: intentRes.clientSecret,
                });
                if (actionError) {
                  ev.complete("fail");
                  trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: actionError.code ?? undefined });
                  setStripeCardError(stripeDeclineMsg(actionError, t) ?? actionError.message ?? t("checkout.toast.cardPaymentFailed"));
                  resolve();
                  return;
                }
                finalIntent = actionIntent;
              }

              if (finalIntent?.status !== "succeeded") {
                ev.complete("fail");
                setStripeCardError(t("checkout.toast.cardPaymentFailed"));
                resolve();
                return;
              }

              ev.complete("success");
              void maybeSaveNewAddress();
              void maybeSaveProfilePhone();
              const payload = buildOrderPayload({ paymentRef: finalIntent.id, orderId });
              try {
                sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ payload, createdAt: Date.now() }));
              } catch { /* best-effort: sessionStorage full */ }
              clearCart();
              try { localStorage.removeItem(COUPON_STORAGE_KEY); } catch { /* best-effort */ }
              setLocation(`/order-confirmed?status=success`);
            } catch {
              ev.complete("fail");
            } finally {
              resolve();
            }
          };

          pr.on("paymentmethod", pmHandler);
          pr.on("cancel", cancelHandler);
        });

        return;
      }

      if (payMethod === "card") {
        // Inline Stripe Elements flow — no redirect.
        if (!stripe || !elements) {
          toast({
            title: t("checkout.toast.cardUnavailable"),
            description: "Card payment is not available yet. Please refresh the page and try again.",
            variant: "destructive",
          });
          return;
        }
        setStripeCardError(null);

        // Step 1: Create a PaymentIntent server-side (prices resolved from
        // the Presentail OS catalog — client-supplied amounts are never used).
        const intentRes = await createPaymentIntent.mutateAsync({
          data: {
            items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
            orderId,
            currency: "USD",
            email: sender.email || undefined,
            deliveryFeeUsd: districtFee + expressFee + slotFee,
            district: recipient.district,
            expressDelivery: deliveryMode === "express",
            noAddress,
          },
        });

        if (!intentRes.ok || !intentRes.clientSecret) {
          setStripeCardError((intentRes as { message?: string }).message || t("checkout.toast.cardUnavailableDesc"));
          return;
        }

        // Step 2: Confirm the card payment on the client. Stripe validates
        // the card details from Elements and charges the PaymentIntent.
        const cardElement = elements.getElement(CardNumberElement);
        if (!cardElement) {
          setStripeCardError("Card fields could not be found. Please refresh and try again.");
          return;
        }

        const senderName = `${sender.firstName} ${sender.lastName}`.trim();

        // Pass handleActions: false so that if the card issuer requires 3DS
        // we get requires_action back immediately and handle it explicitly
        // below (rather than relying on Stripe's automatic popup which can
        // race with our loading state). The try/finally guarantees the
        // processing flag is cleared even on unexpected runtime throws.
        setCardProcessing(true);
        let finalIntent: import("@stripe/stripe-js").PaymentIntent | undefined;
        try {
          const { error: stripeError, paymentIntent: confirmedIntent } = await stripe.confirmCardPayment(
            intentRes.clientSecret,
            {
              payment_method: {
                card: cardElement,
                billing_details: {
                  ...(sender.email ? { email: sender.email } : {}),
                  ...(senderName ? { name: senderName } : {}),
                },
              },
            },
            { handleActions: false },
          );

          if (stripeError) {
            trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: stripeError.code ?? undefined });
            setStripeCardError(stripeDeclineMsg(stripeError, t) ?? stripeError.message ?? t("checkout.toast.cardPaymentFailed"));
            return;
          }

          // 3DS / SCA: the card issuer requires authentication. Surface
          // Stripe's built-in authentication modal and wait for the result
          // before proceeding. This covers EU/UK PSD2-mandated SCA flows.
          if (confirmedIntent?.status === "requires_action") {
            const { error: actionError, paymentIntent: actionIntent } = await stripe.handleNextAction({
              clientSecret: intentRes.clientSecret,
            });
            if (actionError) {
              trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: actionError.code ?? undefined });
              setStripeCardError(stripeDeclineMsg(actionError, t) ?? actionError.message ?? t("checkout.toast.cardPaymentFailed"));
              return;
            }
            if (!actionIntent) {
              setStripeCardError(t("checkout.toast.cardPaymentFailed"));
              return;
            }
            finalIntent = actionIntent;
          } else {
            finalIntent = confirmedIntent;
          }
        } finally {
          setCardProcessing(false);
        }

        if (finalIntent?.status !== "succeeded") {
          setStripeCardError(t("checkout.toast.cardPaymentFailed"));
          return;
        }

        // Payment confirmed — stash the order and navigate to the confirmation
        // page immediately. OrderConfirmed finalizes the order against the server
        // so the user is never stranded on checkout after a successful Stripe charge.
        void maybeSaveNewAddress();
        void maybeSaveProfilePhone();
        const payload = buildOrderPayload({ paymentRef: finalIntent.id, orderId });
        try {
          sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ payload, createdAt: Date.now() }));
        } catch { /* best-effort: sessionStorage full */ }
        clearCart();
        try { localStorage.removeItem(COUPON_STORAGE_KEY); } catch { /* best-effort */ }
        setLocation(`/order-confirmed?status=success`);
        return;
      }

      if (payMethod === "paypal") {
        const res = await paypalPayment.mutateAsync({
          items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
          district: recipient.district,
          expressDelivery: deliveryMode === "express",
          noAddress,
          currency: "USD",
          returnUrl,
          cancelUrl: failureUrl,
          orderId,
        });
        if (!res.ok || !res.url) {
          toast({
            title: t("checkout.toast.paypalUnavailable"),
            description: res.message || t("checkout.toast.paypalUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(res.url, orderId);
        return;
      }

      // AED + wallet (Apple Pay / Google Pay) is served by Mamo's hosted
      // checkout, which exposes the wallet buttons on its own page. Route it
      // through the same Mamo flow as the "Pay by card" tile so we don't
      // need a separate web wallet integration just for UAE — mirrors the
      // mobile checkout behaviour.
      // apple_pay / google_pay are excluded from AED by the currency table so
      // this guard is a no-op in practice, but kept for defensive correctness.
      const walletViaMamo =
        (payMethod === "apple_pay" || payMethod === "google_pay") && activeCurrency === "AED";

      if (payMethod === "mamo" || walletViaMamo) {
        // Wallet-via-Mamo carries `paymentMethod: "wallet"` in client
        // state, but the WC finalizer treats `wallet` as a Stripe-verified
        // method. Normalise to `"mamo"` in the stashed payload so the
        // post-redirect order creation routes through the Mamo
        // verification branch and matches the paymentRef we just got back
        // from Mamo's hosted page.
        const finalizedPaymentMethod: PaymentMethodId = walletViaMamo
          ? "mamo"
          : payMethod;
        const res = await mamoPayment.mutateAsync({
          items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
          orderId,
          district: recipient.district,
          expressDelivery: deliveryMode === "express",
          noAddress,
          currency: "USD",
          title: t("checkout.payment.orderTitle"),
          description: t("checkout.payment.orderDesc", { name: `${sender.firstName} ${sender.lastName}`.trim() }),
          email: sender.email,
          firstName: sender.firstName,
          lastName: sender.lastName,
          returnUrl,
          failureReturnUrl: failureUrl,
        });
        if (!res.ok || !res.url) {
          toast({
            title: t("checkout.toast.mamoUnavailable"),
            description: res.message || t("checkout.toast.mamoUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(res.url, orderId, finalizedPaymentMethod);
        return;
      }

      await finalizeOrderNow();
    } catch (err) {
      const isNetworkFailure = err instanceof TypeError;
      const apiErr = err as { status?: number; message?: string } | null;
      const isColdCache = apiErr?.status === 503;
      const hasSpecificMessage =
        !isNetworkFailure &&
        !isColdCache &&
        typeof apiErr?.message === "string" &&
        !apiErr.message.startsWith("API error ");
      const description = isNetworkFailure
        ? t("checkout.toast.networkTimeout")
        : isColdCache
          ? t("checkout.toast.catalogLoading")
          : hasSpecificMessage
            ? apiErr!.message!
            : t("checkout.toast.networkError");
      toast({
        title: t("checkout.toast.errorTitle"),
        description,
        variant: "destructive",
      });
      trackEvent({ name: "payment_error", surface: "checkout", action: isNetworkFailure ? "network" : isColdCache ? "catalog_cold" : "provider" });
    }
  };

  // Availability / label / fallback decisions all go through the pure
  // helpers in `./checkoutPayMethods` (which wrap the shared
  // `@workspace/pay-methods` table). Methods that aren't selectable for the
  // active currency + country are hidden entirely so shoppers only see real
  // choices — this mirrors mobile and replaces the previous bespoke
  // per-method `*Hidden` flags / disabled-row UI.
  // NOTE: payCtxCountry, paymentOptions, and the payment-method fallback
  // useEffect are computed above (before early returns) to satisfy Rules of Hooks.

  const stepLabels = [
    t("checkout.step.deliveryDetails"),
    t("checkout.step3.title"),
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f4f4f5" }}>
      {/* ── Checkout header ── */}
      <header className="sticky top-0 z-40" style={{ backgroundColor: "hsl(var(--primary))" }}>
        <div className="max-w-content mx-auto px-page py-4 flex items-center justify-between text-primary-foreground">
          <Link
            href="/cart"
            className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-75"
            style={{ color: "rgba(255,255,255,0.72)" }}
            data-testid="link-back-to-cart"
          >
            <ArrowLeft className={`w-4 h-4 ${dir === "rtl" ? "rotate-180" : ""}`} />
            <span className="hidden sm:inline">{t("checkout.backToCart")}</span>
          </Link>
          <Logo height={64} inverse={true} />
          <div className="w-8 sm:w-24" />
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="max-w-content mx-auto px-page py-3 flex items-center justify-center">
            {stepLabels.map((label, i) => {
              const n = i + 1;
              const done = step > n;
              const active = step === n;
              return (
                <Fragment key={i}>
                  <button
                    type="button"
                    onClick={() => { if (done) setStep(n); }}
                    className="flex flex-col items-center gap-1.5"
                    aria-label={label}
                  >
                    <div
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                        done
                          ? "border-white bg-white text-primary"
                          : active
                          ? "border-white bg-white text-primary"
                          : "border-white/25 bg-transparent text-white/30"
                      }`}
                    >
                      {done ? <Check className="w-3.5 h-3.5" /> : n}
                    </div>
                    <span
                      className={`text-[11px] font-medium leading-none hidden sm:block tracking-wide ${
                        active ? "text-white" : done ? "text-white/65" : "text-white/30"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                  {i < 1 && (
                    <div
                      className={`w-10 sm:w-20 h-px mx-3 mb-5 transition-colors ${
                        done ? "bg-white/50" : "bg-white/15"
                      }`}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      </header>
      {/* ── Page content ── */}
      <div className="max-w-content mx-auto px-page py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* ── Main form ── */}
          <div className="flex-1 min-w-0">

            {/* ── STEP 1 · Delivery Details ── */}
            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="mb-6">
                  <h1 className="text-2xl font-serif text-primary mb-1">{t("checkout.step.deliveryDetails")}</h1>
                  <p className="text-sm text-muted-foreground">{t("checkout.step1.desc")}</p>
                </div>

                {/* Recipient Details */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-5">{t("checkout.section.recipientDetails")}</p>

                  {savedAddresses.length > 0 && (
                    <div className="mb-5">
                      <Popover open={addressPickerOpen} onOpenChange={setAddressPickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary/40 transition-colors"
                            data-testid="button-use-saved-address"
                          >
                            <BookUser className="w-4 h-4 text-primary" />
                            {t("checkout.useSavedAddress")}
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-1">
                          <div className="py-1 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t("checkout.savedAddresses")}
                          </div>
                          {savedAddresses.map((addr) => (
                            <button
                              key={addr.id}
                              type="button"
                              onClick={() => {
                                applyAddressToRecipient(addr, setRecipient);
                                setAddressPickerOpen(false);
                              }}
                              className="w-full flex items-start gap-2.5 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-secondary/60 transition-colors"
                              data-testid={`saved-address-option-${addr.id}`}
                            >
                              <MapPin className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                              <div className="min-w-0">
                                <div className="font-medium leading-snug">{addressDisplayLabel(addr)}</div>
                                {addr.district && (
                                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{addr.district}</div>
                                )}
                                {addr.isDefault && (
                                  <div className="text-xs text-gold font-medium mt-0.5">{t("checkout.defaultLabel")}</div>
                                )}
                              </div>
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  <div
                    className={`flex items-center gap-3 mb-4 rounded-xl border px-3.5 py-3 bg-card transition-colors ${
                      noAddress ? "border-primary" : "border-border"
                    }`}
                    data-testid="check-no-address-label"
                  >
                    <button
                      type="button"
                      onClick={() => setNoAddress(!noAddress)}
                      className="flex flex-1 items-center gap-3 text-start cursor-pointer"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                          noAddress ? "bg-primary text-primary-foreground" : "bg-muted text-primary"
                        }`}
                      >
                        <MapPin className="h-[18px] w-[18px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          {t("checkout.askRecipientForAddressTitle")}
                        </div>
                        <div className="text-xs text-muted-foreground leading-snug mt-0.5">
                          {t("checkout.askRecipientForAddressNote")}
                        </div>
                      </div>
                    </button>
                    <Switch
                      checked={noAddress}
                      onCheckedChange={setNoAddress}
                      data-testid="check-no-address"
                      aria-label={t("checkout.askRecipientForAddressTitle")}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t("checkout.firstName")}<span className="text-destructive ms-0.5">*</span></label>
                      <Input value={recipient.firstName} onChange={(e) => setRecipient({ ...recipient, firstName: e.target.value })} placeholder={t("checkout.firstNamePh")} data-testid="input-recipient-first-name" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t("checkout.lastName")}<span className="text-destructive ms-0.5">*</span></label>
                      <Input value={recipient.lastName} onChange={(e) => setRecipient({ ...recipient, lastName: e.target.value })} placeholder={t("checkout.lastNamePh")} data-testid="input-recipient-last-name" />
                    </div>
                  </div>

                  <div className="mb-4">
                    <WebPhoneField
                      label={t("checkout.phoneLB", { country: country?.name ?? "Lebanon" })}
                      value={recipient.phone}
                      onChange={(v) => setRecipient({ ...recipient, phone: v })}
                      defaultCountry={(countryCode ?? "LB").toUpperCase()}
                      required
                      showError={phoneSubmitAttempted}
                      errorMessage={t("checkout.phoneInvalidNumber")}
                      data-testid="input-recipient-phone"
                    />
                  </div>

                  {!noAddress && (
                    <>
                      <div className="space-y-2 mb-4">
                        <label className="text-sm font-medium">{t("checkout.district")}<span className="text-destructive ms-0.5">*</span></label>
                        <Select
                          value={recipient.district}
                          onValueChange={(v) => setRecipient({ ...recipient, district: v })}
                          disabled={locationsLoading || !hasActiveCities}
                        >
                          <SelectTrigger data-testid="select-district">
                            <SelectValue
                              placeholder={
                                selectedCityData
                                  ? cityName(selectedCityData.id, selectedCityData.name)
                                  : locationsLoading
                                  ? t("checkout.districtLoading")
                                  : !hasActiveCities
                                  ? t("checkout.districtUnavailable")
                                  : t("checkout.selectDistrict")
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {currentCountryCities.map((city) => {
                              const inactive = city.isActive === false;
                              const label = cityName(city.id, city.name);
                              return (
                                <SelectItem key={city.id} value={city.name} disabled={inactive}>
                                  {label}
                                  {inactive && (
                                    <span className="ml-1.5 text-xs text-muted-foreground/70">
                                      {t("location.cityUnavailable")}
                                    </span>
                                  )}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 mb-4">
                        <label className="text-sm font-medium">{t("checkout.address")}<span className="text-destructive ms-0.5">*</span></label>
                        <Textarea rows={3} value={recipient.address} onChange={(e) => setRecipient({ ...recipient, address: e.target.value })} placeholder={t("checkout.addressPh")} data-testid="input-recipient-address" />
                      </div>

                      {isSignedIn && (
                        <label className="flex items-center gap-3 cursor-pointer select-none mb-1" data-testid="check-save-address-label">
                          <Switch
                            checked={saveAddress}
                            onCheckedChange={setSaveAddress}
                            data-testid="check-save-address"
                            aria-label={t("checkout.saveAddress")}
                          />
                          <div>
                            <div className="text-sm font-medium">{t("checkout.saveAddress")}</div>
                            <div className="text-xs text-muted-foreground">{t("checkout.saveAddressHint")}</div>
                          </div>
                        </label>
                      )}
                    </>
                  )}

                </div>

                {/* Sender Details */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-5">{t("checkout.section.senderDetails")}</p>

                  {isSignedIn ? (
                    <div className="mb-4 rounded-xl border bg-secondary/40 p-4" data-testid="sender-summary">
                      <p className="text-sm">
                        {t("checkout.sendingAs", {
                          summary: [
                            `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim(),
                            user?.email ?? "",
                            profilePhone,
                          ].filter((s) => s && s.trim()).join(" · "),
                        })}
                      </p>
                      <Link href="/account/personal-information" className="mt-1 inline-block text-xs underline" data-testid="link-edit-account">
                        {t("checkout.editInAccount")}
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">{t("checkout.firstName")}<span className="text-destructive ms-0.5">*</span></label>
                          <Input value={sender.firstName} onChange={(e) => setSender({ ...sender, firstName: e.target.value })} data-testid="input-sender-first-name" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">{t("checkout.lastName")}<span className="text-destructive ms-0.5">*</span></label>
                          <Input value={sender.lastName} onChange={(e) => setSender({ ...sender, lastName: e.target.value })} data-testid="input-sender-last-name" />
                        </div>
                      </div>
                      <div className="space-y-1.5 mb-4">
                        <label className="text-sm font-medium">{t("checkout.emailAddress")}<span className="text-destructive ms-0.5">*</span></label>
                        <Input type="email" value={sender.email} onChange={(e) => setSender({ ...sender, email: e.target.value })} data-testid="input-sender-email" />
                      </div>
                    </>
                  )}

                  {!hasProfilePhone && (
                    <div className="mb-4">
                      <WebPhoneField
                        label={t("checkout.phoneNumber")}
                        value={sender.phone}
                        onChange={(v) => setSender({ ...sender, phone: v })}
                        defaultCountry="LB"
                        required
                        showError={phoneSubmitAttempted}
                        errorMessage={t("checkout.phoneInvalidNumber")}
                        data-testid="input-sender-phone"
                      />
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer select-none" data-testid="check-identity-secret-label">
                    <input type="checkbox" checked={identitySecret} onChange={(e) => setIdentitySecret(e.target.checked)} className="mt-1 h-4 w-4 accent-primary cursor-pointer" data-testid="check-identity-secret" />
                    <span className="text-sm">{t("checkout.keepIdentitySecret")}</span>
                  </label>
                  {identitySecret && (
                    <p className="text-xs text-gray-500 mt-1 ml-7" data-testid="identity-secret-hint">{t("checkout.keepIdentitySecretHint")}</p>
                  )}
                </div>

                {/* Delivery Time */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-5">{t("checkout.section.deliveryTime")}</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => expressAvailable && setDeliveryMode("express")}
                      disabled={!expressAvailable}
                      data-testid="delivery-mode-express"
                      className={`px-4 py-4 rounded-xl border text-sm font-medium transition-all text-left ${
                        deliveryMode === "express" ? "text-white" : "border-border bg-card text-foreground hover:border-primary/30"
                      } ${!expressAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
                      style={deliveryMode === "express" ? { borderColor: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary))" } : {}}
                    >
                      <div className="font-semibold">{t("checkout.expressDelivery")}</div>
                      <div className="text-xs opacity-80 mt-1">{expressAvailable ? <><span>+</span><FormattedPrice usdValue={expressSurcharge} /></> : t("checkout.expressUnavailable")}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryMode("schedule")}
                      data-testid="delivery-mode-schedule"
                      className={`px-4 py-4 rounded-xl border text-sm font-medium transition-all text-left ${
                        deliveryMode === "schedule" ? "text-white" : "border-border bg-card text-foreground hover:border-primary/30"
                      }`}
                      style={deliveryMode === "schedule" ? { borderColor: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary))" } : {}}
                    >
                      <div className="font-semibold">{t("checkout.scheduleDelivery")}</div>
                      <div className="text-xs opacity-80 mt-1">{t("checkout.scheduleDeliveryDesc")}</div>
                    </button>
                  </div>
                  {deliveryMode === "schedule" && (
                    <ScheduleInlinePanel
                      countryCode={countryCode}
                      initialDate={recipient.deliveryDate || undefined}
                      initialSlotLabel={deliverySlot || undefined}
                      timeSlots={timeSlots}
                      onChange={({ date, slotLabel }) => {
                        setRecipient((r) => ({ ...r, deliveryDate: date }));
                        setDeliverySlot(slotLabel);
                      }}
                    />
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" size="lg" className="h-14 rounded-xl px-8" onClick={() => setLocation("/cart")} data-testid="button-back-to-cart-from-delivery">{t("checkout.back")}</Button>
                  <Button
                    size="lg"
                    className="flex-1 h-14 rounded-xl text-white font-semibold"
                    style={{ backgroundColor: "hsl(var(--primary))" }}
                    onClick={() => {
                      setPhoneSubmitAttempted(true);
                      const recipientPhoneOk = !!recipient.phone && isValidPhoneNumber(recipient.phone);
                      const senderPhoneOk = hasProfilePhone || (!!sender.phone && isValidPhoneNumber(sender.phone));
                      if (!recipientPhoneOk || !senderPhoneOk) return;
                      setStep(2);
                    }}
                    disabled={!recipient.firstName || !isValidPhoneNumber(recipient.phone) || (!noAddress && !recipient.district) || (!noAddress && !recipient.address) || (!isSignedIn && (!sender.firstName || !sender.email)) || (!hasProfilePhone && !sender.phone.trim())}
                    data-testid="button-continue-to-payment"
                  >
                    {t("checkout.continuePayment")}
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 2 · Payment ── */}
            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="mb-6">
                  <h1 className="text-2xl font-serif text-primary mb-1">{t("checkout.step3.title")}</h1>
                  <p className="text-sm text-muted-foreground">{t("checkout.step3.desc")}</p>
                </div>

                {/* Note for team */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">{t("checkout.noteForTeam")}</p>
                  <textarea
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder={t("checkout.noteForTeamPh")}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                  />
                </div>

                {/* Payment methods */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-4">{t("checkout.section.payment")}</p>
                  <div className="space-y-3">
                    {(paymentOptions ?? []).map((m) => {
                      const offlineDesc = m.id === "whish" ? t("checkout.pay.whishDesc") : m.id === "western" ? t("checkout.pay.westernDesc") : null;
                      type LogoSpec = { name: string; src: string; fill?: boolean; maxH?: string };
                      const cardLogos: LogoSpec[] = [
                        { name: "Mastercard", src: mastercardLogo, maxH: "max-h-[18px]" },
                        { name: "Visa", src: visaLogo, maxH: "max-h-[14px]" },
                        { name: "American Express", src: amexLogo, fill: true },
                      ];
                      const methodLogos: Record<string, LogoSpec[]> = {
                        card: cardLogos,
                        mamo: cardLogos,
                        paypal: [{ name: "PayPal", src: paypalLogo, fill: true }],
                        apple_pay: [
                          { name: "Apple Pay", src: applePayLogo, maxH: "max-h-[14px]" },
                        ],
                        google_pay: [
                          { name: "Google Pay", src: googlePayLogo, maxH: "max-h-[14px]" },
                        ],
                        whish: [{ name: "Whish Money", src: whishLogo, fill: true }],
                        western: [{ name: "Western Union", src: westernUnionLogo, fill: true }],
                      };
                      const logos = methodLogos[m.id] ?? [];
                      return (
                        <div
                          key={m.id}
                          className={`p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === m.id ? "ring-1" : "hover:border-primary/25 hover:bg-secondary/30"}`}
                          style={paymentMethod === m.id ? { borderColor: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary) / 0.04)", outlineColor: "hsl(var(--primary) / 0.15)" } : {}}
                          onClick={() => { setPaymentMethod(m.id); setStripeCardError(null); }}
                          data-testid={`option-payment-${m.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors" style={paymentMethod === m.id ? { borderColor: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary))" } : { borderColor: "rgba(0,0,0,0.25)" }}>
                              {paymentMethod === m.id && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <span className="font-medium text-sm">{t(m.labelKey)}</span>
                            {logos.length > 0 && (
                              <div className="ml-auto flex items-center gap-1">
                                {logos.map((logo) => (
                                  <span
                                    key={logo.name}
                                    title={logo.name}
                                    className={logo.fill ? "inline-flex overflow-hidden rounded-[4px] shadow-sm" : "inline-flex items-center justify-center bg-white rounded-[4px] shadow-sm overflow-hidden p-[4px]"}
                                    style={{ width: 48, height: 34 }}
                                  >
                                    <img
                                      src={logo.src}
                                      alt={logo.name}
                                      className={logo.fill ? "block w-full h-full object-fill" : `block max-w-[30px] object-contain ${logo.maxH ?? ""}`}
                                      loading="lazy"
                                      decoding="async"
                                      draggable={false}
                                    />
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {paymentMethod === m.id && offlineDesc && (
                            <p className="mt-2 ms-8 text-sm text-muted-foreground leading-relaxed">{offlineDesc}</p>
                          )}
                          {paymentMethod === m.id && m.id === "card" && (
                            <StripeCardFields
                              error={stripeCardError}
                              disabled={isProcessing}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-3 mb-4">
                  <Button variant="outline" size="lg" className="h-14 rounded-xl px-8" onClick={() => setStep(1)} data-testid="button-back-to-sender">{t("checkout.back")}</Button>
                  <Button size="lg" className="flex-1 h-14 rounded-xl text-white font-semibold text-base" style={{ backgroundColor: "hsl(var(--primary))" }} onClick={handleSubmit} disabled={isProcessing} data-testid="button-submit-payment">
                    {isProcessing ? t("checkout.processing") : <>{t("checkout.placeOrderNow_prefix")} <FormattedPrice usdValue={total} /></>}
                  </Button>
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
                  <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  {t("checkout.securePayments")}
                </div>
              </div>
            )}
          </div>

          {/* ── Order Summary Sidebar ── */}
          <div className="w-full lg:w-96 xl:w-[420px] shrink-0">
            <div className="sticky top-36">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100" style={{ backgroundColor: "hsl(var(--primary) / 0.05)" }}>
                  <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--primary))" }}>{t("checkout.summary")}</h3>
                </div>
                <div className="px-6 py-5">
                  {/* Items */}
                  <div className="space-y-4 mb-5 max-h-56 overflow-y-auto">
                    {items.map((item) => (
                      <div key={item.product.id} className="flex gap-3" data-testid={`row-summary-${item.product.id}`}>
                        <div className="w-14 h-14 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                          {item.product.image?.uri && <img src={item.product.image.uri} alt={item.product.name} className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-2 leading-snug">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t("checkout.qty")}: {item.quantity}</p>
                          <p className="text-sm font-semibold mt-0.5" style={{ color: "hsl(var(--primary))" }}><FormattedPrice usdValue={item.product.priceValue * item.quantity} /></p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Coupon */}
                  <div className="border-t border-gray-100 pt-4 mb-4">
                    {couponApplied ? (
                      <>
                        <div className="flex justify-between text-sm mb-1.5" style={{ color: "hsl(var(--primary))" }} data-testid="row-coupon-discount">
                          <div className="flex items-center gap-1.5">
                            <Tag className="w-3 h-3 shrink-0" />
                            <span className="font-medium">{couponInput}</span>
                            <span className="text-muted-foreground text-xs">· {t("checkout.coupon.applied")}</span>
                          </div>
                          <span className="font-medium">{confirmedCouponDiscount > 0 ? <>−<FormattedPrice usdValue={confirmedCouponDiscount} /></> : "—"}</span>
                        </div>
                        <button type="button" onClick={handleCouponRemove} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive transition-colors">{t("checkout.coupon.remove")}</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={handleCouponToggle} className="text-sm underline underline-offset-2 hover:opacity-70 transition-opacity font-medium" style={{ color: "hsl(var(--primary))" }} data-testid="button-coupon-toggle">
                          {t("checkout.coupon.toggle")}
                        </button>
                        {couponOpen && (
                          <div className="mt-3">
                            <div className={`flex gap-2 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
                              <Input
                                ref={couponInputRef}
                                value={couponInput}
                                onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); if (couponError) setCouponError(null); }}
                                onKeyDown={(e) => e.key === "Enter" && handleCouponApply()}
                                placeholder={t("checkout.coupon.placeholder")}
                                className={`h-10 text-sm uppercase${couponError ? " border-destructive focus-visible:ring-destructive" : ""}`}
                                data-testid="input-coupon-code-checkout"
                              />
                              <Button type="button" size="sm" variant="outline" className="h-10 shrink-0" onClick={handleCouponApply} disabled={!couponInput.trim()} data-testid="button-coupon-apply-checkout">
                                {t("checkout.coupon.apply")}
                              </Button>
                            </div>
                            {couponError && <p className="mt-1.5 text-xs text-destructive" data-testid="text-coupon-error-checkout">{couponError}</p>}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Line items */}
                  <div className="space-y-2.5 border-t border-gray-100 pt-4">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t("cart.subtotal")}</span>
                      <span data-testid="text-subtotal"><FormattedPrice usdValue={subtotal} /></span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t("checkout.deliveryLabel")}</span>
                      <span><FormattedPrice usdValue={districtFee} /></span>
                    </div>
                    {expressFee > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground" data-testid="row-express-fee">
                        <span>{t("checkout.expressDeliveryLabel")}</span>
                        <span><FormattedPrice usdValue={expressFee} /></span>
                      </div>
                    )}
                    {slotFee > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground" data-testid="row-slot-fee">
                        <span>{t("checkout.nightDeliverySurcharge") || "Night Delivery"}</span>
                        <span><FormattedPrice usdValue={slotFee} /></span>
                      </div>
                    )}
                  </div>

                  {/* Total */}
                  <div className="flex justify-between font-semibold text-base pt-4 mt-3 border-t border-gray-100">
                    <span style={{ color: "hsl(var(--primary))" }}>{t("cart.total")}</span>
                    <span style={{ color: "hsl(var(--primary))" }} data-testid="text-total"><FormattedPrice usdValue={Math.max(0, total - confirmedCouponDiscount)} /></span>
                  </div>

                  {effectiveFreeDeliveryEnabled !== false && (
                  <div className="mt-4">
                    <FreeDeliveryBanner overrideThresholdUsd={effectiveFreeDeliveryThresholdUsd} />
                  </div>
                  )}
                </div>

                {/* Delivery Summary */}
                <div className="border-t border-gray-100 px-6 py-5" style={{ backgroundColor: "#f4f4f5" }}>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "hsl(var(--primary))" }}>
                    {t("checkout.deliverySummary")}
                  </p>
                  <DeliveryDateRow rowText={deliveryRowText} onChangeClick={() => setDeliveryPickerOpen(true)} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
      {/* ── Dialogs ── */}
      <DeliveryPickerModal
        open={deliveryPickerOpen}
        onOpenChange={setDeliveryPickerOpen}
        onConfirm={handleDeliveryPickerConfirm}
        timeSlots={timeSlots}
        cityExpressAvailable={selectedCityData?.expressAvailable === true}
      />
    </div>
  );
}

export default function Checkout() {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm />
    </Elements>
  );
}

