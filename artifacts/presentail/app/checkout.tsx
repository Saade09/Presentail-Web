import { Feather } from "@expo/vector-icons";
import Swipeable from "react-native-gesture-handler/Swipeable";
import QRCode from "react-native-qrcode-svg";
import {
  createMyAddress,
  getListMyAddressesQueryKey,
  useListMyAddresses,
  type CustomerAddress,
} from "@workspace/api-client-react";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
// react-native-view-shot and expo-sharing are NATIVE modules. They were
// added in the build that ships as iOS build 25, but build 22 (currently
// on TestFlight) doesn't include them. A static `import` triggers the
// native bridge at module load and crashes the screen on older binaries.
// Lazy-require with try/catch so build 22 still opens the checkout — the
// Share button just becomes a no-op until the new build lands.
let _captureRef: ((view: any, opts?: any) => Promise<string>) | null = null;
let _Sharing: { isAvailableAsync: () => Promise<boolean>; shareAsync: (uri: string, opts?: any) => Promise<void> } | null = null;
function loadShareModules() {
  if (_captureRef && _Sharing) return { captureRef: _captureRef, Sharing: _Sharing };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vs = require("react-native-view-shot");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sh = require("expo-sharing");
    _captureRef = vs?.captureRef ?? null;
    _Sharing = sh ?? null;
  } catch {
    _captureRef = null;
    _Sharing = null;
  }
  return { captureRef: _captureRef, Sharing: _Sharing };
}
import {
  Alert,
  Animated,
  findNodeHandle,
  FlatList,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { ApplePayBadge, CardIcons, GooglePayBadge, PayPalBadge, WesternUnionBadge, WhishBadge } from "@/components/PaymentBadges";
import { PaymentSubmitButton, isBrandedPayMethod } from "@/components/PaymentSubmitButton";
import { SuggestedMessagesSheet } from "@/components/SuggestedMessagesSheet";
import { PhoneField } from "@/components/PhoneField";
import { DateStrip } from "@/components/DateStrip";
import { SlotPicker } from "@/components/SlotPicker";
import { SkeletonBox } from "@/components/SkeletonBox";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { COUNTRY_DIAL_CODES, type CountryDialCode } from "@/data/countryCodes";
import { feeForDistrict, type District } from "@/data/districts";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import {
  AE_EXPRESS_SURCHARGE,
  LB_EXPRESS_SURCHARGE,
  EXPRESS_OPEN_HOUR,
  EXPRESS_CLOSE_HOUR,
  dayLabels,
  expressSurchargeForCountry,
  firstAvailableDay,
  getCountryHour,
  isExpressDeliveryAvailable,
  resolveSlotLabel,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";
import { useDeliveryConfig } from "@/hooks/useDeliveryConfig";
import { createMamoPayment, createPayPalOrder, finalizeHostedPayment } from "@/lib/payments";
import {
  isPayMethodSupported,
  nextPayMethodForCurrency,
  type PayMethodId,
} from "@workspace/pay-methods";
import { CardField, CardFieldInput, useStripe, PlatformPay } from "@stripe/stripe-react-native";
import { API_BASE, createPaymentIntent, createStripeCheckoutSession, getStripePublishableKey, fetchSavedPaymentMethods, deleteSavedPaymentMethod } from "@/lib/stripe";
import { createWooOrder } from "@/lib/woo";
import { clearPendingOrder, savePendingOrder } from "@/lib/pendingOrder";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readAttribution } from "@/lib/attribution";
import { trackEvent } from "@/lib/analytics";
import { trackFbMobileEvent } from "@/lib/fbPixel";
import { firePostOrderAnalytics } from "@/lib/postOrderAnalytics";
import { useNow } from "@/lib/useNow";
import { submitWooOrderWithRetry } from "@/lib/wooSubmit";
import { isDiscountActive } from "@/lib/salePriceHelpers";
import { getDeviceId } from "@/services/notifications";

export {
  isPayMethodSupported,
  defaultPayMethodFor,
  nextPayMethodForCurrency,
  payMethodAvailability,
} from "@workspace/pay-methods";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

const APP_SCHEME = "presentail";

function buildReturnUrls(orderId: string) {
  const deeplinkBase = `${APP_SCHEME}://payment-return`;
  const deeplinkOk = `${deeplinkBase}?orderId=${encodeURIComponent(orderId)}&status=success`;
  const deeplinkCancel = `${deeplinkBase}?orderId=${encodeURIComponent(orderId)}&status=cancel`;
  const successUrl = `${API_BASE}/api/payment/return?status=success&deeplink=${encodeURIComponent(deeplinkOk)}`;
  const cancelUrl = `${API_BASE}/api/payment/return?status=cancel&deeplink=${encodeURIComponent(deeplinkCancel)}`;
  return { deeplinkBase, successUrl, cancelUrl };
}

function isStorageError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = (err as { name?: string }).name ?? "";
  const msg = err.message ?? "";
  return (
    name === "QuotaExceededError" ||
    /quota|storage|disk.full|no.space|securestore/i.test(msg)
  );
}

function getStatusFromReturnUrl(url: string): string | null {
  // Hand-rolled query parsing — `URL` isn't reliably available on RN.
  const q = url.split("?")[1];
  if (!q) return null;
  for (const pair of q.split("&")) {
    const [k, v = ""] = pair.split("=");
    if (decodeURIComponent(k) === "status") return decodeURIComponent(v);
  }
  return null;
}

async function runHostedCheckout(url: string, deeplinkBase: string): Promise<"success" | "cancel"> {
  if (Platform.OS === "web") {
    // On web, just open in a new tab; treat as success since we can't track return
    if (typeof window !== "undefined") window.open(url, "_blank");
    return "success";
  }
  const result = await WebBrowser.openAuthSessionAsync(url, deeplinkBase);
  if (result.type === "success" && result.url) {
    return getStatusFromReturnUrl(result.url) === "success" ? "success" : "cancel";
  }
  return "cancel";
}

type Step = 0 | 1 | 2;
const _STEPS = ["Customize", "Delivery Details", "Payment"] as const;

// Re-exported for tests and any module that imports the legacy names from
// here. The canonical source is `lib/delivery.ts`.
export { LB_EXPRESS_SURCHARGE, AE_EXPRESS_SURCHARGE };

function countryFromCurrency(currencyCode?: string): string | undefined {
  if (currencyCode === "AED") return "AE";
  if (currencyCode === "EUR") return "CY";
  if (currencyCode === "USD") return "LB";
  return undefined;
}

function resolveCountryCode(selectedCountryCode?: string, currencyCode?: string): string | undefined {
  return selectedCountryCode || countryFromCurrency(currencyCode);
}

function CheckoutLoadingSkeleton() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 14,
          paddingBottom: 14,
          backgroundColor: colors.primary,
          alignItems: "center",
        }}
      >
        <View style={{ height: 24, width: 120, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
          <SkeletonBox style={StyleSheet.absoluteFill} />
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingVertical: 18, backgroundColor: "#fff", borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ alignItems: "center", flex: 1, gap: 8 }}>
              <SkeletonBox width={28} height={28} borderRadius={999} />
              <SkeletonBox width={60} height={8} />
            </View>
          ))}
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 24, gap: 18 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 18, gap: 14 }}>
          <SkeletonBox width="55%" height={14} />
          <View style={{ flexDirection: "row", gap: 14 }}>
            <SkeletonBox width={68} height={68} borderRadius={14} />
            <View style={{ flex: 1, gap: 10, justifyContent: "center" }}>
              <SkeletonBox width="70%" height={11} />
              <SkeletonBox width="35%" height={10} />
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 18, gap: 14 }}>
          <SkeletonBox width="40%" height={14} />
          <SkeletonBox width="100%" height={44} borderRadius={12} />
          <SkeletonBox width="100%" height={44} borderRadius={12} />
        </View>
      </View>
    </View>
  );
}

function CheckoutScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { items, detailed, total, clear, setQty, remove, cartMessage: cartMessageFromCart } = useCart();
  const { loading: productsLoading } = useWooProducts();
  const { formatPrice, currencyCode } = useCurrency();
  const { token: authToken, user: authUser, updateProfile } = useAuth();
  const { selectedCountry, selectedCity, isLoading: locationsLoading } = useDeliveryLocation();
  const t = useT();
  const headingFontMedium = useHeadingFont("500Medium");
  const headingFontRegular = useHeadingFont("400Regular");
  const headingFontBold = useHeadingFont("700Bold");
  const effectiveCountry = resolveCountryCode(selectedCountry?.code, currencyCode);

  // Stores the server-assigned order ID for the current checkout attempt.
  // Generated once via /api/orders/next-id and reused across retries so
  // a shopper who retries after a payment decline reuses the same order ID.
  const orderIdRef = useRef<string | null>(null);

  const ensureOrderId = async (): Promise<string> => {
    if (orderIdRef.current) return orderIdRef.current;
    const countryCode = selectedCountry?.code ?? "LB";
    const resp = await fetch(`${API_BASE}/api/orders/next-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode }),
    });
    if (!resp.ok) {
      throw new Error(`Failed to reserve order ID (HTTP ${resp.status})`);
    }
    const json = (await resp.json()) as { ok: boolean; orderId?: string };
    if (!json.ok || typeof json.orderId !== "string" || !json.orderId) {
      throw new Error("Failed to reserve order ID: invalid server response");
    }
    orderIdRef.current = json.orderId;
    return json.orderId;
  };

  // Resolved lazily inside placeOrder to avoid hitting AsyncStorage on
  // every checkout render.
  const [deviceIdForOrder, setDeviceIdForOrder] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDeviceId().then((id) => {
      if (!cancelled) setDeviceIdForOrder(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultDialCode = COUNTRY_DIAL_CODES.find((c) => c.code === (effectiveCountry ?? "LB")) ?? COUNTRY_DIAL_CODES.find((c) => c.code === "LB") ?? COUNTRY_DIAL_CODES[0];

  const params = useLocalSearchParams<{ step?: string | string[] }>();
  const initialStep = React.useMemo<Step>(() => {
    const raw = Array.isArray(params.step) ? params.step[0] : params.step;
    const parsed = Number(raw);
    if (parsed === 1 || parsed === 2) return parsed as Step;
    return 0;
  }, [params.step]);
  const [step, setStep] = useState<Step>(initialStep);

  // Funnel: emit one checkout_started per checkout mount. The cart →
  // checkout transition is the riskiest drop-off in the purchase path,
  // so we measure it directly rather than inferring it from cart_viewed.
  useEffect(() => {
    trackEvent({ name: "checkout_started", surface: "checkout" });
    trackFbMobileEvent("InitiateCheckout", {
      countryCode: effectiveCountry,
      email: authUser?.email || undefined,
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Step 1 — Customize / Card Message
  const [recipientFirst, setRecipientFirst] = useState("");
  const [recipientLast, setRecipientLast] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientCountry, setRecipientCountry] = useState<CountryDialCode>(defaultDialCode);
  const [recipientPhoneShowError, setRecipientPhoneShowError] = useState(false);
  const [cardTo, setCardTo] = useState(cartMessageFromCart?.to ?? "");
  const [cardMessage, setCardMessage] = useState(cartMessageFromCart?.body ?? "");
  const [cardFrom, setCardFrom] = useState(cartMessageFromCart?.from ?? "");
  const [qrLink, setQrLink] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponOpen, setCouponOpen] = useState(false);

  // Seed coupon from the cart-page AsyncStorage key so a code entered on
  // the cart screen survives navigation into checkout without re-entry.
  useEffect(() => {
    AsyncStorage.getItem("@presentail/coupon_v1").then((val) => {
      if (val) {
        setCoupon(val);
        setCouponOpen(true);
      }
    }).catch(() => {});
  }, []);

  // Step 2 — Delivery Details
  // Derive the district picker list from all OS cities (active + inactive).
  // Inactive cities are shown greyed-out and unclickable in the picker so
  // shoppers know those areas exist but aren't currently served.
  // When OS data is still loading (locationsLoading) or returns zero cities for
  // a country, we return an empty array and show a loading / empty state on the
  // picker instead of falling back to a hardcoded governorate list.
  type CheckoutDistrict = District & { isActive?: boolean };
  const districts = useMemo<CheckoutDistrict[]>(() => {
    return (selectedCountry?.cities ?? []).map((c) => ({
      name: c.name,
      // OS fee takes priority; fall back to the hardcoded lookup table.
      fee: c.fee ?? feeForDistrict(effectiveCountry, c.name),
      isActive: c.isActive,
    }));
  }, [selectedCountry, effectiveCountry]);
  const cityDistrictMatch = selectedCity
    ? districts.find((d) => d.name === selectedCity.name && d.isActive !== false)
    : null;
  const [district, setDistrict] = useState<CheckoutDistrict | null>(
    cityDistrictMatch ?? districts.find((d) => d.isActive !== false) ?? null,
  );
  const districtManuallyEdited = React.useRef(false);
  const prevCityRef = React.useRef(selectedCity?.id);
  const prevCountryRef = React.useRef(selectedCountry?.code);
  React.useEffect(() => {
    const cityChanged = selectedCity?.id !== prevCityRef.current;
    const countryChanged = selectedCountry?.code !== prevCountryRef.current;
    prevCityRef.current = selectedCity?.id;
    prevCountryRef.current = selectedCountry?.code;
    if (cityChanged || countryChanged) {
      districtManuallyEdited.current = false;
    }
    if (countryChanged) {
      const cc = resolveCountryCode(selectedCountry?.code, currencyCode);
      // When the new city already has OS-configured slots, use those; otherwise
      // fall back to the hardcoded per-country table so the picker is never empty.
      const newSlots = (selectedCity?.timeSlots?.length
        ? selectedCity.timeSlots
        : timeSlotsForCountry(cc)) as TimeSlot[];
      const h = getCountryHour(cc);
      setSlot(newSlots.find(s => s.cutoffHour > h) ?? newSlots[0] ?? null);
      const newDial = COUNTRY_DIAL_CODES.find((d) => d.code === (cc ?? "LB")) ?? COUNTRY_DIAL_CODES[0];
      setRecipientCountry(newDial);
      setSenderCountry(newDial);
    }
    if (districtManuallyEdited.current) return;
    if (selectedCity) {
      const match = districts.find((d) => d.name === selectedCity.name && d.isActive !== false);
      if (match) {
        setDistrict(match);
        return;
      }
    }
    if (countryChanged) {
      // Always reset district on country change — set to first active city
      // or null when OS has returned no active cities for the new country.
      setDistrict(districts.find((d) => d.isActive !== false) ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry, selectedCity, districts]);
  const [districtOpen, setDistrictOpen] = useState(false);
  const [noAddress, setNoAddress] = useState(false);
  const [deliveryDetails, setDeliveryDetails] = useState("");
  const [senderFirst, setSenderFirst] = useState("");
  const [senderLast, setSenderLast] = useState("");
  const [senderWhatsapp, setSenderWhatsapp] = useState("");
  const [senderCountry, setSenderCountry] = useState<CountryDialCode>(defaultDialCode);
  const [senderEmail, setSenderEmail] = useState("");

  // Signed-in shoppers already gave us their identity at signup, so we
  // hide the sender Name/Email inputs and only keep the WhatsApp field
  // visible when the profile has no phone yet (so we can ask once and
  // persist it back to the account). We seed the sender state from the
  // auth user so the order payload still carries those values even when
  // the inputs aren't rendered. `hadProfilePhoneOnMount` is captured
  // once so we can decide post-order whether to PUT the phone back to
  // the profile — if we re-read `authUser.phone` after a successful
  // save, the flag would flip and we'd skip the save next time.
  const profilePhone = (authUser?.phone ?? "").trim();
  const hasProfilePhone = !!authUser && profilePhone.length > 0;
  const hadProfilePhoneOnMountRef = React.useRef<boolean | null>(null);
  useEffect(() => {
    if (!authUser) return;
    if (hadProfilePhoneOnMountRef.current === null) {
      hadProfilePhoneOnMountRef.current = profilePhone.length > 0;
    }
    if (authUser.firstName && !senderFirst) setSenderFirst(authUser.firstName);
    if (authUser.lastName && !senderLast) setSenderLast(authUser.lastName);
    if (authUser.email && !senderEmail) setSenderEmail(authUser.email);
    // Intentionally do not seed senderWhatsapp — when the profile has a
    // phone we hide the field and use `profilePhone` directly in the
    // billing payload, so a stale UI value can never silently overwrite
    // the canonical profile value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);
  const [identitySecret, setIdentitySecret] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [savedAddressPickerOpen, setSavedAddressPickerOpen] = useState(false);
  const [activeAddressId, setActiveAddressId] = useState<number | null>(null);
  // Mirror activeAddressId in a ref so the sync effect can read the current
  // value without adding it as a reactive dependency (which would cause the
  // effect to re-run — and potentially re-apply — every time the picker is used).
  const activeAddressIdRef = React.useRef<number | null>(null);
  activeAddressIdRef.current = activeAddressId;

  const savedAddressesQuery = useListMyAddresses({
    query: { queryKey: getListMyAddressesQueryKey(), enabled: !!authUser },
  });
  const savedAddresses = savedAddressesQuery.data?.addresses ?? [];

  // Tracks the id of the default address that was most recently auto-applied
  // by the sync effect. null means the effect has never fired.
  const appliedDefaultIdRef = React.useRef<number | null>(null);

  // Set to true when the shopper types directly into any recipient field.
  // Prevents the sync effect from overwriting intentional edits.
  const recipientManuallyEdited = React.useRef(false);

  // Wrapped setters that mark the recipient section as manually edited.
  // applySavedAddress calls the raw state setters below so it never
  // accidentally sets this flag.
  const setRecipientFirstTracked = React.useCallback((v: string) => {
    recipientManuallyEdited.current = true;
    setRecipientFirst(v);
  }, []);
  const setRecipientLastTracked = React.useCallback((v: string) => {
    recipientManuallyEdited.current = true;
    setRecipientLast(v);
  }, []);
  const setRecipientPhoneTracked = React.useCallback((v: string) => {
    recipientManuallyEdited.current = true;
    setRecipientPhoneShowError(false);
    setRecipientPhone(v);
  }, []);

  const applySavedAddress = (addr: CustomerAddress) => {
    const matchedCountry = COUNTRY_DIAL_CODES.find(
      (c) => c.code === addr.countryCode,
    );
    if (matchedCountry) setRecipientCountry(matchedCountry);
    // Use the raw setters so applySavedAddress never marks the section dirty.
    if (addr.recipientFirstName) setRecipientFirst(addr.recipientFirstName);
    if (addr.recipientLastName) setRecipientLast(addr.recipientLastName);
    if (addr.recipientPhone) setRecipientPhone(addr.recipientPhone);
    if (addr.recipientPhoneCountryCode) {
      const matchedDial = COUNTRY_DIAL_CODES.find(
        (c) => c.dial === addr.recipientPhoneCountryCode,
      );
      if (matchedDial) setRecipientCountry(matchedDial);
    }
    // Try to match the saved district against the buyer's currently
    // available delivery districts so the fee is correct. Otherwise the
    // buyer keeps their existing district selection and the saved
    // district name is recorded in the address line so the courier
    // still sees it.
    const districtMatch = districts.find(
      (d) => d.name.trim().toLowerCase() === addr.district.trim().toLowerCase() && d.isActive !== false,
    );
    if (districtMatch) {
      districtManuallyEdited.current = true;
      setDistrict(districtMatch);
    }
    // Merge any legacy building / apartment / directions detail into the
    // combined address line so we don't silently drop information that
    // was captured under the old multi-field form.
    const baseLine = districtMatch
      ? addr.addressLine
      : [addr.addressLine, addr.district].filter(Boolean).join(" · ");
    setDeliveryDetails(
      [
        baseLine,
        addr.building && `Bldg: ${addr.building}`,
        addr.apartment && `Apt/Floor: ${addr.apartment}`,
        addr.directions,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    setNoAddress(false);
    setActiveAddressId(addr.id);
    setSavedAddressPickerOpen(false);
  };

  // Keeps the delivery address fields in sync with the shopper's saved default.
  //
  // First-time apply: fills empty fields from the default address on mount.
  // Re-sync: when savedAddresses refreshes (e.g. after returning from the
  //   saved-addresses screen and changing the default), re-applies the new
  //   default — but only when the shopper has not made manual edits and has
  //   not explicitly switched to a non-default address via the picker.
  React.useEffect(() => {
    if (!authUser) return;
    if (savedAddresses.length === 0) return;
    const def = savedAddresses.find((a) => a.isDefault) ?? null;
    if (!def) return;

    // ── First-time apply ─────────────────────────────────────────────────
    if (appliedDefaultIdRef.current === null) {
      // Don't overwrite anything the shopper has already typed.
      if (deliveryDetails.trim() || noAddress) return;
      appliedDefaultIdRef.current = def.id;
      applySavedAddress(def);
      return;
    }

    // ── Re-sync when the default address changes ──────────────────────────
    if (def.id === appliedDefaultIdRef.current) return; // default unchanged

    // Respect manual edits — never overwrite what the shopper typed directly.
    if (recipientManuallyEdited.current) return;

    // Respect an explicit picker selection — if the shopper chose a different
    // (non-default) address from the picker, honour that choice.
    const currentActive = activeAddressIdRef.current;
    if (currentActive !== null && currentActive !== appliedDefaultIdRef.current) return;

    appliedDefaultIdRef.current = def.id;
    applySavedAddress(def);
    // applySavedAddress and the ref/state reads are intentionally omitted from
    // the deps array: we only want to re-run when the address list or districts
    // change, not on every intermediate state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, savedAddresses, districts]);
  const days = useMemo(() => dayLabels(t.checkoutDayToday, t.checkoutDayTomorrow), [t.checkoutDayToday, t.checkoutDayTomorrow]);
  const now = useNow();
  // Use OS-provided slots for the selected city when available; fall back to
  // the hardcoded per-country slot table so existing behaviour is preserved
  // when the city has no OS config yet.
  // Safety net: if the flat list is empty but slotsByDay is present (e.g. Akkar
  // configured per-day-only), derive the effective flat list as the deduplicated
  // union of all per-day arrays before reaching the country-wide fallback.
  // This guards against stale cached API responses that predate the API server fix.
  const timeSlots = (selectedCity?.timeSlots?.length
    ? selectedCity.timeSlots
    : selectedCity?.slotsByDay && Object.keys(selectedCity.slotsByDay).length > 0
      ? Object.values(selectedCity.slotsByDay as Record<string, TimeSlot[]>)
          .flat()
          .filter((s, i, arr) => arr.findIndex((t) => t.cutoffHour === s.cutoffHour) === i)
      : timeSlotsForCountry(effectiveCountry)) as TimeSlot[];
  // Express availability: when OS explicitly configures the city, honour the
  // OS flag and cutoff hour. Otherwise fall back to the hardcoded 8 AM–10 PM
  // window so the feature keeps working for cities without OS config yet.
  const expressAvailable = useMemo(() => {
    if (selectedCity?.expressAvailable === false) return false;
    const h = getCountryHour(effectiveCountry, now);
    const closeHour =
      typeof selectedCity?.sameDayCutoffHour === "number"
        ? selectedCity.sameDayCutoffHour
        : EXPRESS_CLOSE_HOUR;
    if (typeof selectedCity?.expressAvailable === "boolean") {
      return h >= EXPRESS_OPEN_HOUR && h < closeHour;
    }
    return isExpressDeliveryAvailable(effectiveCountry, now);
  }, [selectedCity, effectiveCountry, now]);
  const expressSurcharge = expressSurchargeForCountry(effectiveCountry);
  const { freeDeliveryEnabled: isFreeDeliveryEnabled, freeDeliveryThresholdUsd: freeDeliveryThreshold } = useDeliveryConfig();
  const deliverySelection = useDeliverySelection();
  const todayIso = days[0].iso;
  const defaultSlotForToday = useMemo<TimeSlot | null>(() => {
    const h = getCountryHour(effectiveCountry);
    return timeSlots.find((s) => s.cutoffHour > h) ?? null;
  }, [timeSlots, effectiveCountry]);

  const deliveryMode: "express" | "today_slot" | "schedule" =
    deliverySelection.mode ?? (defaultSlotForToday == null ? "schedule" : "today_slot");
  // When there is no stored selection and today has no remaining slots, compute
  // the first available date synchronously so DateStrip highlights the correct
  // tile on first render (before the seeding useEffect below fires).
  const date = useMemo(() => {
    if (deliverySelection.date) return deliverySelection.date;
    if (deliverySelection.mode != null) return todayIso;
    if (defaultSlotForToday == null) {
      const h = getCountryHour(effectiveCountry);
      const result = firstAvailableDay(todayIso, timeSlots, h, todayIso);
      return result?.iso ?? todayIso;
    }
    return todayIso;
  }, [deliverySelection.date, deliverySelection.mode, defaultSlotForToday, todayIso, timeSlots, effectiveCountry]);
  const slot = useMemo<TimeSlot | null>(() => {
    if (deliverySelection.slotLabel) {
      const found = timeSlots.find((s) => s.label === deliverySelection.slotLabel);
      if (found) return found;
    }
    return defaultSlotForToday;
  }, [deliverySelection.slotLabel, timeSlots, defaultSlotForToday]);

  // Initialise the persisted selection on first mount if the user has never
  // visited checkout before, and re-validate any stored slot label against
  // the current country's slot list AND the current country-local hour
  // (so a stored same-day slot whose cutoff has already passed gets bumped
  // to the next available one, and if today is fully sold out we advance
  // to the next available day automatically). Keep it defensive: never throw.
  useEffect(() => {
    const h = getCountryHour(effectiveCountry);
    if (deliverySelection.mode == null) {
      if (defaultSlotForToday == null) {
        // Today fully past — advance to the first available day.
        const result = firstAvailableDay(todayIso, timeSlots, h, todayIso);
        deliverySelection.setSelection({
          mode: result && result.iso !== todayIso ? "schedule" : "today_slot",
          date: result?.iso ?? todayIso,
          slotLabel: result?.slot.label ?? null,
        });
      } else {
        deliverySelection.setSelection({
          mode: "today_slot",
          date: todayIso,
          slotLabel: defaultSlotForToday.label,
        });
      }
      return;
    }
    if (deliverySelection.mode === "today_slot") {
      const isToday = (deliverySelection.date ?? todayIso) === todayIso;
      const fixed = resolveSlotLabel(
        deliverySelection.slotLabel,
        timeSlots,
        isToday,
        h,
      );
      if (fixed !== deliverySelection.slotLabel) {
        if (fixed === null && isToday) {
          // Today's last slot has passed — advance to the next available day.
          const result = firstAvailableDay(todayIso, timeSlots, h, todayIso);
          deliverySelection.setSelection({
            mode: result && result.iso !== todayIso ? "schedule" : "today_slot",
            date: result?.iso ?? todayIso,
            slotLabel: result?.slot.label ?? null,
          });
        } else {
          deliverySelection.setSlotLabel(fixed);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeSlots, effectiveCountry]);

  const setDeliveryMode = deliverySelection.setMode;
  const setDate = deliverySelection.setDate;
  const setSlot = deliverySelection.setSlot;

  // Auto-fallback when the recipient-country clock crosses 10 PM while
  // the shopper is sitting on the page with Express selected. Mirrors
  // the web checkout behaviour so the order can still be placed (and
  // matches the cutoff promised by the shared delivery library).
  useEffect(() => {
    if (deliveryMode === "express" && !expressAvailable) {
      setDeliveryMode("today_slot");
    }
  }, [deliveryMode, expressAvailable, setDeliveryMode]);

  // Step 3 — Payment
  const [orderNotes, setOrderNotes] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethodId>("apple_pay");

  // Reset the selected method only when the active currency makes it
  // unusable. Otherwise we preserve the customer's explicit choice so
  // a USD shopper who picked PayPal isn't silently forced onto card.
  // (See `nextPayMethodForCurrency` for the unit-tested rule.)
  useEffect(() => {
    const next = nextPayMethodForCurrency(payMethod, currencyCode, {
      country: effectiveCountry,
    });
    if (next !== payMethod) setPayMethod(next);
  }, [currencyCode, payMethod, effectiveCountry]);

  const [paying, setPaying] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  // ── Saved card / save-card state ────────────────────────────────────────
  const [saveCard, setSaveCard] = useState(false);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<
    { id: string; brand: string; last4: string; expMonth: number; expYear: number }[]
  >([]);
  const [selectedSavedCardId, setSelectedSavedCardId] = useState<string | null>(null);

  // Fetch saved payment methods when the authenticated user is on step 2.
  useEffect(() => {
    if (!authToken || step !== 2) return;
    let cancelled = false;
    fetchSavedPaymentMethods(authToken).then((methods) => {
      if (!cancelled) setSavedPaymentMethods(methods);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, step]);

  const handleRemoveSavedCard = useCallback(async (pmId: string) => {
    if (!authToken) return;
    const ok = await deleteSavedPaymentMethod(pmId, authToken);
    if (ok) {
      setSavedPaymentMethods((prev) => prev.filter((pm) => pm.id !== pmId));
      setSelectedSavedCardId((prev) => (prev === pmId ? null : prev));
    }
  }, [authToken]);
  // ─────────────────────────────────────────────────────────────────────────
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const deliveryStepRef = useRef<{ scrollToFirstError: () => void } | null>(null);
  const { confirmPayment, handleNextAction, isPlatformPaySupported, confirmPlatformPayPayment } = useStripe();

  // Probe wallet (Apple Pay / Google Pay) availability early — before the
  // shopper taps "Place Order" — so we can silently fall back to card / Mamo
  // if the device has no wallet configured (e.g. no Apple Pay card set up,
  // simulator, Google Pay not linked).
  // null = probe not yet complete; true = supported; false = not supported.
  // State (not a ref) so that when the probe resolves the picker re-renders
  // and hides the apple_pay / google_pay rows on unsupported devices.
  const [walletSupported, setWalletSupported] = useState<boolean | null>(null);
  // Separate ref guards against running the probe more than once.
  const walletProbedRef = useRef(false);
  useEffect(() => {
    if (walletProbedRef.current) return;
    walletProbedRef.current = true;
    // Test-only escape hatch: `addInitScript` sets this before React boots so
    // the probe is bypassed and walletSupported resolves to true.  The flag is
    // never set in production builds (no pk_live_ key is absent in prod, but
    // more importantly the window property simply doesn't exist).
    if (
      typeof window !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__PRESENTAIL_TEST_WALLET_SUPPORTED__ === true
    ) {
      setWalletSupported(true);
      return;
    }
    const isTestEnv = !getStripePublishableKey(currencyCode).startsWith("pk_live_");
    isPlatformPaySupported(
      Platform.OS === "android"
        ? { googlePay: { testEnv: isTestEnv } }
        : undefined,
    ).then((supported) => {
      setWalletSupported(supported);
      if (!supported) {
        // Advance to the first supported non-wallet method so the shopper
        // is never left on a tile that would fail at submission.
        //   • AED  → mamo  (Stripe doesn't settle AED; Mamo is the card option)
        //   • else → card  (Stripe settles all other supported currencies)
        setPayMethod((current) => {
          if (current !== "apple_pay" && current !== "google_pay") return current;
          return currencyCode === "AED" ? "mamo" : "card";
        });
      }
    }).catch(() => {
      // Probe failed — assume unsupported so rows are hidden and selection falls back.
      setWalletSupported(false);
      setPayMethod((current) => {
        if (current !== "apple_pay" && current !== "google_pay") return current;
        return currencyCode === "AED" ? "mamo" : "card";
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the probe already resolved "not supported" and the selection is later
  // switched to apple_pay or google_pay (currency change, manual tap), re-apply
  // the fallback immediately using the resolved state value.
  useEffect(() => {
    if (payMethod !== "apple_pay" && payMethod !== "google_pay") return;
    if (walletSupported === false) {
      setPayMethod(currencyCode === "AED" ? "mamo" : "card");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payMethod, walletSupported]);

  // Maps known Stripe decline codes to plain-language, actionable messages.
  // stripe-react-native exposes the decline code in error.code for card declines.
  // Returns null for unrecognised codes so the caller falls back to the generic message.
  function stripeDeclineMsg(error: { code?: string | null }): string | null {
    if (error.code === "insufficient_funds") return t.checkoutDeclineInsufficientFunds;
    if (error.code === "card_velocity_exceeded") return t.checkoutDeclineVelocityExceeded;
    if (error.code === "do_not_honor") return t.checkoutDeclineDoNotHonor;
    if (error.code === "lost_card" || error.code === "stolen_card") return t.checkoutDeclineLostStolen;
    if (error.code === "expired_card") return t.checkoutDeclineExpiredCard;
    if (error.code === "incorrect_cvc") return t.checkoutDeclineIncorrectCvc;
    return null;
  }

  const fees = useMemo(() => {
    const subtotal = total;
    const baseDeliveryFee = noAddress ? 35 : (district?.fee ?? 0);
    const districtFee = (isFreeDeliveryEnabled && subtotal >= freeDeliveryThreshold) ? 0 : baseDeliveryFee;
    const expressFee = deliveryMode === "express" ? expressSurcharge : 0;
    const grand = subtotal + districtFee + expressFee;
    return { subtotal, districtFee, expressFee, grand };
  }, [total, deliveryMode, district, freeDeliveryThreshold, isFreeDeliveryEnabled, expressSurcharge, noAddress]);

  const isSignedIn = !!authUser;
  const senderNameRequired = !isSignedIn;
  const senderEmailRequired = !isSignedIn;
  const senderPhoneRequired = !hasProfilePhone;

  const isRecipientPhoneValid = () => {
    const trimmed = recipientPhone.trim();
    if (!trimmed) return false;
    try {
      return isValidPhoneNumber(trimmed, recipientCountry.code as CountryCode);
    } catch {
      return false;
    }
  };

  const stepValid = (s: Step) => {
    if (s === 0) return true;
    if (s === 1)
      return (
        recipientFirst.trim() &&
        recipientLast.trim() &&
        isRecipientPhoneValid() &&
        (noAddress || (!!district && district.isActive !== false && deliveryDetails.trim())) &&
        (!senderNameRequired || (senderFirst.trim() && senderLast.trim())) &&
        (!senderPhoneRequired || senderWhatsapp.trim()) &&
        (!senderEmailRequired || senderEmail.trim())
      );
    if (s === 2) return !!payMethod;
    return false;
  };

  const getMissingFields = (): string[] => {
    if (step !== 1) return [];
    const missing: string[] = [];
    if (!recipientFirst.trim()) missing.push(t.checkoutMfRecipientFirst);
    if (!recipientLast.trim()) missing.push(t.checkoutMfRecipientLast);
    if (!recipientPhone.trim()) missing.push(t.checkoutMfRecipientPhone);
    else if (!isRecipientPhoneValid()) missing.push(t.phoneInvalidNumber);
    if (!noAddress && (!district || district.isActive === false)) missing.push(t.districtLabel);
    if (!noAddress && !deliveryDetails.trim()) missing.push(t.checkoutMfDeliveryAddress);
    if (senderNameRequired && !senderFirst.trim()) missing.push(t.checkoutMfSenderFirst);
    if (senderNameRequired && !senderLast.trim()) missing.push(t.checkoutMfSenderLast);
    if (senderPhoneRequired && !senderWhatsapp.trim()) missing.push(t.checkoutMfSenderWhatsapp);
    if (senderEmailRequired && !senderEmail.trim()) missing.push(t.checkoutMfSenderEmail);
    return missing;
  };

  useEffect(() => {
    setShowFieldErrors(false);
  }, [step]);

  const next = () => {
    if (!stepValid(step)) {
      if (step === 1 && recipientPhone.trim() && !isRecipientPhoneValid()) {
        setRecipientPhoneShowError(true);
      }
      if (step === 1) {
        setShowFieldErrors(true);
        InteractionManager.runAfterInteractions(() => {
          deliveryStepRef.current?.scrollToFirstError();
        });
      }
      const missing = getMissingFields();
      if (missing.length > 0) {
        Alert.alert(
          t.checkoutPleaseCompleteTitle,
          `${t.checkoutMissingFieldsMsg}\n• ${missing.join("\n• ")}`,
          [{ text: "OK" }]
        );
      }
      return;
    }
    if (step < 2) setStep(((step + 1) as Step));
    else placeOrder();
  };

  const buildWooPayload = (orderId: string) => ({
    orderId,
    items: detailed.map(({ product, qty }) => ({
      name: product.name,
      quantity: qty,
      price: product.priceValue,
      wcId: product.wcId,
      customInput: items.find((i) => i.productId === product.id)?.customNote?.trim() || undefined,
    })),
    billing: {
      firstName: senderFirst,
      lastName: senderLast,
      email: senderEmail,
      // For signed-in shoppers with a phone on file we hide the input and
      // use the canonical profile phone, so a stale UI value can never
      // overwrite it.
      phone: hasProfilePhone
        ? profilePhone
        : `${senderCountry.dial} ${senderWhatsapp}`.trim(),
    },
    recipient: {
      firstName: recipientFirst,
      lastName: recipientLast,
      phone: `${recipientCountry.dial} ${recipientPhone}`.trim(),
    },
    district: district?.name ?? "",
    districtFee: fees.districtFee,
    expressFee: fees.expressFee,
    noAddress,
    // ISO-3166 alpha-2 country codes from the customer's selected
    // country dialer. The API persists these on the WC order so tax
    // and shipping records reflect the actual destination (e.g. AE)
    // instead of a hardcoded LB.
    billingCountry: senderCountry.code,
    shippingCountry: recipientCountry.code,
    deliveryDetails: noAddress ? "To be confirmed" : deliveryDetails,
    deliveryDate: deliveryMode === "express" ? days[0].iso : date,
    deliverySlot: deliveryMode === "express" ? t.checkoutExpressDeliveryLabel : (slot?.label ?? ""),
    cardMessage,
    cardFrom: ((cardFrom.trim() || [authUser?.firstName, authUser?.lastName].filter(Boolean).join(" ").trim()).slice(0, 300) || undefined),
    cardTo,
    ...(/^https?:\/\/.+/.test((qrLink ?? "").trim()) ? { qrLink: qrLink.trim() } : {}),
    orderNotes,
    // "apple_pay" / "google_pay" are client-side UX IDs only; WooCommerce
    // and the API server only know the legacy "wallet" value (both call the
    // same Stripe native-wallet flow).  Map both back before submission.
    paymentMethod:
      payMethod === "apple_pay" || payMethod === "google_pay" ? "wallet" : payMethod,
    identitySecret,
    appDeviceId: deviceIdForOrder ?? undefined,
    // Forwarded so the backend can record the customer-facing currency.
    // NOTE: WooCommerce may not honor non-USD totals automatically; the
    // server should treat this as informational unless explicitly handled.
    currencyCode,
  });

  // Await WooCommerce order creation with a sensible timeout and a single
  // retry. After a successful payment we must never silently lose the
  // order — if both attempts fail, we route to a failure/retry screen and
  // keep the cart intact so the customer can re-submit, while the server
  // logs the failure (with the orderId) so support can reconcile.
  const submitWooOrder = async (
    orderId: string,
    paymentRef?: string,
  ): Promise<boolean> => {
    let attribution: import("@/lib/attribution").Attribution | null = null;
    try {
      attribution = await readAttribution();
    } catch {
      // storage unavailable — never block checkout
    }
    const marketingAttribution = attribution
      ? {
          source: "mobile",
          first_touch: attribution.first_touch,
          last_touch: attribution.last_touch,
          conversion: {
            order_total: String(total),
            currency: currencyCode,
            converted_at: new Date().toISOString(),
          },
        }
      : undefined;
    const result = await submitWooOrderWithRetry({
      createWooOrder: () =>
        createWooOrder(
          {
            ...buildWooPayload(orderId),
            paymentRef,
            ...(marketingAttribution ? { marketing_attribution: marketingAttribution } : {}),
          },
          { authToken, filter: { countryCode: selectedCountry?.code, cityId: selectedCity?.id } },
        ),
      warn: (msg, meta) =>
        console.warn(`[checkout] ${msg}`, { orderId, ...(meta ?? {}) }),
    });
    return result.ok;
  };

  const placeOrder = async () => {
    if (paying) return;
    setCardError(null);
    setPaying(true);
    try {
    const orderId = await ensureOrderId();

    const slotLabel = slot?.label ?? "";
    const buildResultPath = (status: "success" | "failed", paymentRef?: string) => {
      const params = new URLSearchParams({
        orderId,
        total: String(fees.grand),
        currency: currencyCode,
        date,
        slot: slotLabel,
        recipient: `${recipientFirst} ${recipientLast}`,
        status,
      });
      if (paymentRef) params.set("paymentRef", paymentRef);
      return `/order-confirmed?${params.toString()}` as const;
    };

    // After a successful payment, await WC order creation. On failure,
    // navigate to the result screen with status=failed so the customer
    // sees a retry/contact-support state — not a generic confirmation.
    //
    // `deferredStartedAt` is supplied only by redirect (Mamo / PayPal / Stripe
    // hosted fallback) flows — it's the timestamp captured right before the
    // hosted browser opened. A backgrounded app can resume that browser session
    // and return "success" long after the shopper abandoned it; when the
    // deferred payment is stale we must NOT create the order — we route to the
    // failure screen instead so an abandoned redirect never becomes a real
    // order. Inline flows (card / native wallet / Whish / Western Union) pass no
    // timestamp and are therefore never gated. The gate itself lives in the
    // pure, unit-tested `finalizeHostedPayment` helper.
    const finishAfterPayment = async (
      paymentRef?: string,
      deferredStartedAt?: number,
    ) => {
      await finalizeHostedPayment({
        deferredStartedAt,
        createOrder: () => submitWooOrder(orderId, paymentRef),
        onStale: async () => {
          // The shopper has already been charged (a deferred redirect always
          // carries a paymentRef), so stash the exact order payload — the
          // failure screen can replay it through createWooOrder without
          // forcing a re-charge — then route to the failure state.
          if (paymentRef) {
            await savePendingOrder({
              payload: { ...buildWooPayload(orderId), paymentRef },
              authToken,
              filter: { countryCode: selectedCountry?.code, cityId: selectedCity?.id },
            });
          }
          router.replace(buildResultPath("failed", paymentRef));
        },
        onSettled: (ok) => finishAfterPaymentSettled(ok, paymentRef),
      });
    };

    const finishAfterPaymentSettled = async (ok: boolean, paymentRef?: string) => {
      if (ok) {
        // CartContext.clear() also clears the persisted delivery selection
        // via the onClear listener registered in DeliverySelectionContext, so
        // we don't need to call deliverySelection.clear() explicitly here.
        clear();
        // Clear the promo code so a future cart session starts fresh.
        AsyncStorage.removeItem("@presentail/coupon_v1").catch(() => {});
        // Best-effort save of the delivery address to the customer's profile
        // when they opted in. Never blocks order completion.
        if (saveAddress && authUser && !noAddress) {
          try {
            await createMyAddress({
              label: "home",
              nickname: null,
              countryCode: recipientCountry.code,
              district: district?.name ?? "",
              addressLine: deliveryDetails.trim() || (district?.name ?? ""),
              apartment: null,
              building: null,
              directions: null,
              recipientFirstName: recipientFirst.trim() || null,
              recipientLastName: recipientLast.trim() || null,
              recipientPhoneCountryCode: recipientPhone.trim()
                ? recipientCountry.dial
                : null,
              recipientPhone: recipientPhone.trim() || null,
              isDefault: false,
            });
          } catch {
            // Silent: the order itself succeeded; saving an address is
            // a convenience and must not surface an error to the user.
          }
        }
        // Best-effort phone save: when a signed-in shopper had no phone
        // on file and just typed one in the WhatsApp field, persist it
        // to their profile so the next checkout hides the field too.
        // Never blocks order completion — failures are logged, swallowed.
        if (
          authUser &&
          hadProfilePhoneOnMountRef.current === false &&
          senderWhatsapp.trim()
        ) {
          const phoneToSave = `${senderCountry.dial} ${senderWhatsapp.trim().replace(/^0+/, "")}`.trim();
          updateProfile({ phone: phoneToSave }).catch((err) => {
            console.warn("[checkout] post-order phone save failed", {
              orderId,
              err: err?.message ?? String(err),
            });
          });
        }
        // Funnel terminal step + Facebook Purchase CAPI — fired once the WC
        // order is confirmed. Both calls are co-located in firePostOrderAnalytics
        // so the FB event cannot be dropped without breaking the unit tests.
        firePostOrderAnalytics({
          payMethod,
          effectiveCountry,
          feesGrand: fees.grand,
          currencyCode,
          contentIds: detailed.map((d) => d.product.id),
          senderEmail,
          hasProfilePhone,
          profilePhone: profilePhone || undefined,
          senderWhatsapp,
          senderCountryDial: senderCountry.dial,
          paymentRef: paymentRef ?? undefined,
        });
        // Terminal success — drop any pending-order stash left over from an
        // earlier failed attempt so it can never be replayed on a later
        // failure screen.
        await clearPendingOrder();
        // Stash a lightweight item list (name + customInput) so the
        // order-confirmed screen can show each item's personalisation note.
        // Best-effort: a storage failure must never block order completion.
        try {
          const confirmedItems = detailed.map(({ product, qty }) => ({
            name: product.name,
            quantity: qty,
            customInput: items.find((i) => i.productId === product.id)?.customNote?.trim() || undefined,
          }));
          await AsyncStorage.setItem(
            "@presentail/confirmed_items_v1",
            JSON.stringify(confirmedItems),
          );
        } catch {
          // Storage errors are non-fatal.
        }
        router.replace(buildResultPath("success", paymentRef));
      } else {
        // Keep cart intact so the customer can retry without rebuilding it.
        // When the shopper has already been charged (an online payment that
        // returned a paymentRef), stash the exact order payload so the failure
        // screen can replay it through createWooOrder. Offline methods
        // (whish / western) carry no paymentRef and can safely re-enter
        // checkout instead, so we skip the stash for them.
        if (paymentRef) {
          await savePendingOrder({
            payload: { ...buildWooPayload(orderId), paymentRef },
            authToken,
            filter: { countryCode: selectedCountry?.code, cityId: selectedCity?.id },
          });
        }
        router.replace(buildResultPath("failed", paymentRef));
      }
    };

    const { deeplinkBase, successUrl, cancelUrl } = buildReturnUrls(orderId);

    // AED + wallet (Apple Pay / Google Pay) is served by Mamo's hosted
    // checkout, which exposes the wallet buttons on its own page. Route it
    // through the same Mamo flow as the "Pay by card" tile so we don't need
    // a separate native wallet integration just for UAE.
    const walletViaMamo = payMethod === "wallet" && currencyCode === "AED";

    // Inline card payment via @stripe/stripe-react-native.
    // returnURL is required for redirect-based 3DS / SCA flows: after the
    // shopper authenticates in the Stripe WebView, the browser navigates to
    // this deep-link so the SDK can hand control back to the app.  Without it,
    // EU / UK cards that require PSD2 Strong Customer Authentication silently
    // fail because the auth flow has nowhere to return to.
    if (payMethod === "card") {
      const intentResult = await createPaymentIntent({
        items: detailed
          .filter(({ product }) => product.wcId != null)
          .map(({ product, qty }) => ({
            wcId: product.wcId!,
            quantity: qty,
          })),
        orderId,
        currency: currencyCode,
        email: senderEmail,
        metadata: {
          orderId,
          recipient: `${recipientFirst} ${recipientLast}`,
          date,
          slot: slotLabel,
        },
        storeContext: { countryCode: selectedCountry?.code, cityId: selectedCity?.id },
        // Always pass authToken for signed-in users so the server can attach
        // the Stripe Customer to the PaymentIntent. This is required both when
        // saving a new card (setup_future_usage) and when paying with a
        // previously saved card (confirmPayment + paymentMethodId needs customer).
        ...(authToken ? { authToken } : {}),
        // Request card saving only when the shopper opted in and isn't using a saved card.
        ...(saveCard && !selectedSavedCardId ? { saveCard: true } : {}),
      });
      if (!intentResult.ok) {
        if (intentResult.code === "already_paid") {
          // The order was already paid (e.g. the shopper successfully paid on
          // another device, or the server restarted mid-flow and found an
          // existing succeeded PI). Route straight to the confirmation screen
          // without attempting another payment.
          router.replace(buildResultPath("success"));
          setPaying(false);
          return;
        }
        trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
        Alert.alert(
          t.checkoutPaymentErrorTitle,
          intentResult.code === "stripe_not_configured"
            ? t.checkoutStripeUnavailableMsg
            : t.checkoutPaymentNetworkError,
        );
        setPaying(false);
        return;
      }
      // Step 1: confirm the PaymentIntent using the card details collected by
      // CardField (new card) or the saved payment method ID (saved card).
      // For cards that don't need 3DS this returns "Succeeded" immediately.
      // For 3DS / SCA cards the SDK may return "RequiresAction".
      const { paymentIntent: confirmedIntent, error: confirmError } = selectedSavedCardId
        ? await confirmPayment(intentResult.clientSecret, {
            paymentMethodType: "Card",
            paymentMethodData: { paymentMethodId: selectedSavedCardId },
          })
        : await confirmPayment(intentResult.clientSecret, {
            paymentMethodType: "Card",
          });
      if (confirmError) {
        trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: confirmError.code ?? undefined });
        setCardError(stripeDeclineMsg(confirmError) ?? confirmError.localizedMessage ?? confirmError.message ?? t.checkoutPaymentNetworkError);
        setPaying(false);
        return;
      }

      // Step 2: when the card issuer requires 3DS / SCA, surface the Stripe
      // authentication WebView so the shopper can complete the challenge.
      // handleNextAction presents the challenge and returns the final intent
      // status once the shopper authenticates (or cancels).  The returnURL
      // tells the SDK where to redirect back after the WebView closes so the
      // deep-link can hand control back to the app.
      let finalIntent = confirmedIntent;
      if (confirmedIntent?.status === "RequiresAction") {
        const { paymentIntent: actionIntent, error: actionError } =
          await handleNextAction(intentResult.clientSecret, deeplinkBase);
        if (actionError) {
          trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: actionError.code ?? undefined });
          setCardError(stripeDeclineMsg(actionError) ?? actionError.localizedMessage ?? actionError.message ?? t.checkoutPaymentNetworkError);
          setPaying(false);
          return;
        }
        finalIntent = actionIntent;
      }

      if (finalIntent?.status === "Succeeded") {
        await finishAfterPayment(finalIntent.id);
      } else {
        // Any non-Succeeded status at this point means the shopper cancelled
        // or authentication was abandoned.
        trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
        setCardError(t.checkoutPaymentCancelledStripe);
      }
      setPaying(false);
      return;
    }

    // Non-AED wallet (Apple Pay / Google Pay) via @stripe/stripe-react-native native sheet.
    // We create a PaymentIntent first (same flow as inline card) so the server sets the
    // authoritative amount and currency, then present the native wallet sheet to confirm it.
    // If the device doesn't support the native wallet (no wallet app configured, simulator,
    // etc.) we fall back to the Stripe hosted checkout redirect so the shopper is never
    // silently blocked.
    if ((payMethod === "apple_pay" || payMethod === "google_pay") && !walletViaMamo) {
      const intentResult = await createPaymentIntent({
        items: detailed
          .filter(({ product }) => product.wcId != null)
          .map(({ product, qty }) => ({
            wcId: product.wcId!,
            quantity: qty,
          })),
        orderId,
        currency: currencyCode,
        email: senderEmail,
        metadata: {
          orderId,
          recipient: `${recipientFirst} ${recipientLast}`,
          date,
          slot: slotLabel,
        },
        storeContext: { countryCode: selectedCountry?.code, cityId: selectedCity?.id },
      });
      if (!intentResult.ok) {
        trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
        Alert.alert(
          t.checkoutPaymentErrorTitle,
          intentResult.code === "stripe_not_configured"
            ? t.checkoutStripeUnavailableMsg
            : t.checkoutPaymentNetworkError,
        );
        setPaying(false);
        return;
      }

      // Determine merchant country code for the wallet sheet.
      const walletMerchantCountry =
        resolveCountryCode(selectedCountry?.code, currencyCode) ?? "LB";
      // Use test environment when the publishable key is not a live key.
      const isTestEnv = !getStripePublishableKey(currencyCode).startsWith("pk_live_");

      // Check whether the native wallet (Apple Pay on iOS, Google Pay on Android)
      // is available on this device before attempting to present the sheet.
      const nativeWalletAvailable = await isPlatformPaySupported(
        Platform.OS === "android"
          ? { googlePay: { testEnv: isTestEnv } }
          : undefined,
      );

      if (!nativeWalletAvailable) {
        // Native wallet not available on this device (e.g. no Apple Pay card set up,
        // or Google Pay not configured). Fall back to the Stripe hosted checkout so
        // the shopper can still pay via a browser-based wallet flow.
        trackEvent({ name: "payment_wallet_fallback", surface: "checkout", action: Platform.OS === "ios" ? "apple_pay" : "google_pay", errorCode: "not_available" });
        const session = await createStripeCheckoutSession({
          items: detailed
            .filter(({ product }) => product.wcId != null)
            .map(({ product, qty }) => ({
              wcId: product.wcId!,
              quantity: qty,
              name: product.name,
              description: product.description ?? undefined,
            })),
          orderId,
          currency: currencyCode,
          email: senderEmail,
          metadata: {
            orderId,
            recipient: `${recipientFirst} ${recipientLast}`,
            date,
            slot: slotLabel,
          },
          successUrl,
          cancelUrl,
          storeContext: { countryCode: selectedCountry?.code, cityId: selectedCity?.id },
        });
        if (session.ok) {
          const deferredStartedAt = Date.now();
          const outcome = await runHostedCheckout(session.url, deeplinkBase);
          if (outcome === "success") {
            await finishAfterPayment(session.id, deferredStartedAt);
          } else {
            Alert.alert(t.checkoutPaymentCancelledTitle, t.checkoutPaymentCancelledStripe);
          }
          setPaying(false);
          return;
        }
        trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
        Alert.alert(
          t.checkoutPaymentErrorTitle,
          session.code === "stripe_not_configured"
            ? t.checkoutStripeUnavailableMsg
            : t.checkoutPaymentNetworkError,
        );
        setPaying(false);
        return;
      }

      // Build the cart summary shown inside the native Apple Pay / Google Pay sheet.
      // The server-returned amount is authoritative — use it for the total line item
      // so the wallet sheet always reflects exactly what the PaymentIntent will charge.
      const walletTotalStr = (intentResult.amount / 100).toFixed(2);
      const walletCartItems: PlatformPay.CartSummaryItem[] = [
        { paymentType: PlatformPay.PaymentType.Immediate, label: "Presentail", amount: walletTotalStr }, // i18n-ignore
      ];

      const walletParams: PlatformPay.ConfirmParams = {
        applePay: {
          merchantCountryCode: walletMerchantCountry,
          currencyCode,
          cartItems: walletCartItems,
        },
        googlePay: {
          testEnv: isTestEnv,
          merchantCountryCode: walletMerchantCountry,
          currencyCode,
          merchantName: "Presentail", // i18n-ignore
        },
      };

      trackEvent({ name: "payment_wallet_opened", surface: "checkout", action: Platform.OS === "ios" ? "apple_pay" : "google_pay" });
      const { paymentIntent: walletIntent, error: walletError } =
        await confirmPlatformPayPayment(intentResult.clientSecret, walletParams);

      if (walletError) {
        if (walletError.code === "Canceled") {
          // Shopper dismissed the native wallet sheet — not an analytics error.
          Alert.alert(t.checkoutPaymentCancelledTitle, t.checkoutPaymentCancelledStripe);
        } else {
          trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: walletError.code ?? undefined });
          Alert.alert(
            t.checkoutPaymentErrorTitle,
            stripeDeclineMsg(walletError) ?? walletError.localizedMessage ?? walletError.message ?? t.checkoutPaymentNetworkError,
          );
        }
        setPaying(false);
        return;
      }

      if (walletIntent?.status === "Succeeded") {
        await finishAfterPayment(walletIntent.id);
      } else {
        trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
        Alert.alert(t.checkoutPaymentCancelledTitle, t.checkoutPaymentCancelledStripe);
      }
      setPaying(false);
      return;
    }

    if (payMethod === "mamo" || walletViaMamo) {
      const session = await createMamoPayment({
        items: detailed
          .filter(({ product }) => product.wcId != null)
          .map(({ product, qty }) => ({ wcId: product.wcId!, quantity: qty })),
        orderId,
        district: district?.name ?? "",
        expressDelivery: deliveryMode === "express",
        noAddress,
        currency: currencyCode,
        title: `Presentail — ${orderId}`,
        description: `${recipientFirst} ${recipientLast} · ${date}`,
        email: senderEmail || undefined,
        firstName: senderFirst || undefined,
        lastName: senderLast || undefined,
        returnUrl: successUrl,
        failureReturnUrl: cancelUrl,
        storeContext: { countryCode: selectedCountry?.code, cityId: selectedCity?.id },
      });
      if (session.ok) {
        const deferredStartedAt = Date.now();
        const outcome = await runHostedCheckout(session.url, deeplinkBase);
        if (outcome === "success") {
          await finishAfterPayment(session.id, deferredStartedAt);
        } else {
          Alert.alert(t.checkoutPaymentCancelledTitle, t.checkoutPaymentCancelledGeneric);
        }
        setPaying(false);
        return;
      }
      trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
      Alert.alert(t.checkoutMamoErrorTitle, session.code === "mamo_not_configured"
        ? t.checkoutMamoNotConfigured
        : t.checkoutPaymentNetworkError);
      setPaying(false);
      return;
    }

    if (payMethod === "paypal") {
      const session = await createPayPalOrder({
        items: detailed
          .filter(({ product }) => product.wcId != null)
          .map(({ product, qty }) => ({ wcId: product.wcId!, quantity: qty })),
        district: district?.name ?? "",
        expressDelivery: deliveryMode === "express",
        noAddress,
        currency: currencyCode,
        returnUrl: successUrl,
        cancelUrl,
        orderId,
        storeContext: { countryCode: selectedCountry?.code, cityId: selectedCity?.id },
      });
      if (session.ok) {
        const deferredStartedAt = Date.now();
        const outcome = await runHostedCheckout(session.url, deeplinkBase);
        if (outcome === "success") {
          await finishAfterPayment(session.id, deferredStartedAt);
        } else {
          Alert.alert(t.checkoutPaymentCancelledTitle, t.checkoutPaymentCancelledGeneric);
        }
        setPaying(false);
        return;
      }
      trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
      Alert.alert(t.checkoutPaypalErrorTitle, session.code === "paypal_not_configured"
        ? t.checkoutPaypalNotConfigured
        : t.checkoutPaymentNetworkError);
      setPaying(false);
      return;
    }

    // Whish / Western Union: no online payment, but the WC order must
    // still be recorded reliably or the customer's offline payment will
    // never be reconciled. Surface a failure state if WC creation fails.
    await finishAfterPayment();
    } catch (err) {
      // TypeError means the device couldn't reach the server at all
      // (no network, DNS failure, etc.). Any other throw means the
      // payment provider returned an unexpected error.
      const isNetworkFailure = err instanceof TypeError;
      trackEvent({ name: "payment_error", surface: "checkout", action: isNetworkFailure ? "network" : "provider" });
      if (isStorageError(err)) {
        Alert.alert(t.checkoutStorageErrorTitle, t.checkoutStorageErrorMsg);
      } else {
        Alert.alert(
          t.checkoutPaymentErrorTitle,
          isNetworkFailure ? t.checkoutPaymentNetworkTimeout : t.checkoutPaymentNetworkError,
        );
      }
    } finally {
      setPaying(false);
    }
  };

  if (items.length > 0 && productsLoading && detailed.length === 0) {
    return <CheckoutLoadingSkeleton />;
  }

  if (detailed.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 }}>
        <AppText style={{ fontFamily: headingFontMedium, fontSize: 22, color: colors.primary, textAlign: "center" }}>
          {t.checkoutCartEmpty}
        </AppText>
        <Pressable onPress={() => router.replace("/(tabs)/catalog")} style={{ marginTop: 14 }}>
          <AppText style={{ color: colors.gold, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>
            {t.checkoutBrowseBoutique}
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Brand bar — contains brand name (left) and inline stepper (right) */}
      <View
        style={{
          paddingTop: insets.top + 14,
          paddingBottom: 14,
          paddingHorizontal: 16,
          backgroundColor: colors.primary,
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        {/* Brand name — shrinks if screen is narrow so the stepper is never clipped */}
        <AppText
          style={{ fontFamily: headingFontMedium, fontSize: 22, color: "#fff", flexShrink: 1 }}
          numberOfLines={1}
        >
          {t.checkoutBrandHeader}
        </AppText>

        {/* Inline stepper — flex:1 so it fills remaining space; right-aligned.
            Labels are hidden on narrow screens (< 360 px, e.g. iPhone SE)
            so the three bubbles always have room to render without clipping. */}
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", minWidth: 0, marginLeft: 8 }}>
          {([t.checkoutStep0, t.checkoutStep1, t.checkoutStep2] as const).map((label, i) => (
            <View key={label} style={{ flex: 1, alignItems: "center", minWidth: 0 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  alignItems: "center",
                  justifyContent: "center",
                  borderColor: i <= step ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                  backgroundColor: i < step ? "rgba(255,255,255,0.25)" : "transparent",
                }}
              >
                {i < step ? (
                  <Feather name="check" size={11} color="#fff" />
                ) : (
                  <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#fff" }}>
                    {i + 1}
                  </AppText>
                )}
              </View>
              {screenWidth >= 360 && (
                <AppText
                  style={{
                    marginTop: 3,
                    fontFamily: i === step ? "Inter_600SemiBold" : "Inter_400Regular",
                    fontSize: 9,
                    color: i === step ? "#fff" : "rgba(255,255,255,0.6)",
                    textAlign: "center",
                  }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {label}
                </AppText>
              )}
              <View
                style={{
                  marginTop: 3,
                  height: 2,
                  width: "70%",
                  borderRadius: 1,
                  backgroundColor: i === step ? "rgba(255,255,255,0.9)" : "transparent",
                }}
              />
            </View>
          ))}
        </View>
      </View>

      {/* Collapsible order summary — pinned between stepper and scroll body */}
      <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <CollapsibleOrderSummary
          key={step}
          colors={colors}
          detailed={detailed}
          fees={fees}
          setQty={setQty}
          remove={remove}
          coupon={coupon}
          setCoupon={setCoupon}
          couponOpen={couponOpen}
          setCouponOpen={setCouponOpen}
          showDeliveryFee={step > 0}
          initialOpen={false}
        />
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 220, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <>
            <CustomizeStep
              colors={colors}
              cardTo={cardTo}
              setCardTo={setCardTo}
              cardMessage={cardMessage}
              setCardMessage={setCardMessage}
              cardFrom={cardFrom}
              setCardFrom={setCardFrom}
              qrLink={qrLink}
              setQrLink={setQrLink}
            />
          </>
        )}
        {step === 1 && (
          <>
            <DeliveryDetailsStep
              ref={deliveryStepRef}
              colors={colors}
              scrollViewRef={scrollViewRef}
              showFieldErrors={showFieldErrors}
              recipientFirst={recipientFirst}
              setRecipientFirst={setRecipientFirstTracked}
              recipientLast={recipientLast}
              setRecipientLast={setRecipientLastTracked}
              recipientPhone={recipientPhone}
              setRecipientPhone={setRecipientPhoneTracked}
              recipientCountry={recipientCountry}
              setRecipientCountry={(c: CountryDialCode) => { setRecipientPhoneShowError(false); setRecipientCountry(c); }}
              recipientPhoneShowError={recipientPhoneShowError}
              locationsLoading={locationsLoading}
              districts={districts}
              district={district}
              setDistrict={setDistrict}
              districtManuallyEdited={districtManuallyEdited}
              districtOpen={districtOpen}
              setDistrictOpen={setDistrictOpen}
              noAddress={noAddress}
              setNoAddress={setNoAddress}
              deliveryDetails={deliveryDetails}
              setDeliveryDetails={setDeliveryDetails}
              senderFirst={senderFirst}
              setSenderFirst={setSenderFirst}
              senderLast={senderLast}
              setSenderLast={setSenderLast}
              senderWhatsapp={senderWhatsapp}
              setSenderWhatsapp={setSenderWhatsapp}
              senderCountry={senderCountry}
              setSenderCountry={setSenderCountry}
              senderEmail={senderEmail}
              setSenderEmail={setSenderEmail}
              identitySecret={identitySecret}
              setIdentitySecret={setIdentitySecret}
              isSignedIn={isSignedIn}
              hideSenderName={isSignedIn}
              hideSenderEmail={isSignedIn}
              hideSenderPhone={hasProfilePhone}
              senderSummary={isSignedIn ? {
                name: `${authUser?.firstName ?? ""} ${authUser?.lastName ?? ""}`.trim(),
                email: authUser?.email ?? "",
                phone: profilePhone,
              } : null}
              onEditAccount={() => router.push("/personal-information")}
              savedAddresses={savedAddresses}
              activeAddressId={activeAddressId}
              savedAddressPickerOpen={savedAddressPickerOpen}
              setSavedAddressPickerOpen={setSavedAddressPickerOpen}
              applySavedAddress={applySavedAddress}
              saveAddress={saveAddress}
              setSaveAddress={setSaveAddress}
            />
            <DeliveryTimeCard
              colors={colors}
              days={days}
              date={date}
              setDate={setDate}
              slot={slot}
              setSlot={setSlot}
              deliveryMode={deliveryMode}
              setDeliveryMode={setDeliveryMode}
              expressAvailable={expressAvailable}
              timeSlots={timeSlots}
              slotsByDay={selectedCity?.slotsByDay}
              expressSurcharge={expressSurcharge}
              localHour={getCountryHour(effectiveCountry)}
            />
            <DeliverySummaryCard colors={colors} days={days} date={date} slot={slot?.label ?? ""} mode={deliveryMode} />
          </>
        )}
        {step === 2 && (
          <>
            <PaymentStep
              colors={colors}
              orderNotes={orderNotes}
              setOrderNotes={setOrderNotes}
              payMethod={payMethod}
              setPayMethod={(m: PayMethodId) => {
                if (m !== payMethod) {
                  trackEvent({
                    name: "payment_method_selected",
                    surface: "checkout",
                    action: m,
                  });
                  setCardError(null);
                }
                setPayMethod(m);
              }}
              email={senderEmail}
              setEmail={setSenderEmail}
              country={effectiveCountry}
              cardError={cardError}
              setCardError={setCardError}
              scrollViewRef={scrollViewRef}
              walletSupported={walletSupported}
              isAuthenticated={!!authUser}
              saveCard={saveCard}
              setSaveCard={setSaveCard}
              savedPaymentMethods={savedPaymentMethods}
              selectedSavedCardId={selectedSavedCardId}
              setSelectedSavedCardId={setSelectedSavedCardId}
              onRemoveSavedCard={handleRemoveSavedCard}
            />
            <CardMessageReviewCard
              colors={colors}
              cardMessage={cardMessage}
              setCardMessage={setCardMessage}
            />
            <DeliverySummaryCard colors={colors} days={days} date={date} slot={slot?.label ?? ""} mode={deliveryMode} />
          </>
        )}
      </ScrollView>

      {/* Sticky CTA */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
        }}
      >
        {step === 2 && isBrandedPayMethod(payMethod) ? (
          <PaymentSubmitButton
            payMethod={payMethod}
            onPress={next}
            disabled={paying || !stepValid(2)}
            paying={paying}
            processingLabel={t.processingOrder}
          />
        ) : (
          <Pressable
            disabled={paying}
            onPress={next}
            style={({ pressed }) => [
              {
                backgroundColor: stepValid(step) && !paying ? colors.primary : colors.border,
                paddingVertical: 16,
                borderRadius: 14,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 10,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                color: "#fff",
                fontSize: 14,
                letterSpacing: 0.6,
              }}
            >
              {step === 0
                ? t.continueToDelivery
                : step === 1
                  ? t.continueToPayment
                  : paying
                    ? t.processingOrder
                    : `${t.payLabel} ${formatPrice(fees.grand)}`}
            </AppText>
            <Feather name={step === 2 ? "lock" : "arrow-right"} size={14} color="#fff" />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// =============== Reusable bits ===============

function Label({ children, colors, required }: any) {
  return (
    <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>
      {children}
      {required ? <AppText style={{ color: "#c0392b" }}> *</AppText> : null}
    </AppText>
  );
}

function Field({ colors, label, value, onChangeText, onBlur, placeholder, keyboardType, autoCapitalize, autoCorrect, multiline, required, prefix, helper, maxLength, characterCount, error, fieldRef, returnKeyType, onSubmitEditing, inputRef, accessibilityLabel }: any) {
  return (
    <View ref={fieldRef} style={{ gap: 4 }}>
      {label ? <Label colors={colors} required={required}>{label}</Label> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          backgroundColor: "#fff",
          borderWidth: error ? 1.5 : 1,
          borderColor: error ? "#ef4444" : colors.border,
          borderRadius: 10,
          paddingHorizontal: 12,
        }}
      >
        {prefix ? <AppText style={{ fontFamily: "Inter_500Medium", color: colors.primary, marginRight: 6 }}>{prefix}</AppText> : null}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          multiline={multiline}
          maxLength={maxLength}
          returnKeyType={returnKeyType ?? (multiline ? undefined : "next")}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={multiline ? true : !onSubmitEditing}
          accessibilityLabel={accessibilityLabel ?? label}
          style={{
            flex: 1,
            paddingVertical: 12,
            minHeight: multiline ? 110 : undefined,
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            color: colors.primary,
            textAlignVertical: multiline ? "top" : "auto",
            ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
          }}
        />
      </View>
      {helper ? (
        <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>{helper}</AppText>
      ) : null}
      {characterCount && maxLength ? (
        <CharsLeft maxLength={maxLength} value={value} colors={colors} />
      ) : null}
    </View>
  );
}

function CharsLeft({ maxLength, value, colors }: { maxLength: number; value?: string; colors: any }) {
  const t = useT();
  return (
    <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 4, textAlign: "right" }}>
      {maxLength - (value?.length ?? 0)} {t.checkoutCharsLeft}
    </AppText>
  );
}

function Card({ children, colors, title }: any) {
  const headingFontMedium = useHeadingFont("500Medium");
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 18,
        gap: 14,
      }}
    >
      {title ? (
        <AppText style={{ fontFamily: headingFontMedium, fontSize: 18, color: colors.primary }}>
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

// =============== Step 1: Customize ===============

// Loaded defensively: this asset was added after some shipping binaries
// (e.g. build 22) were compiled. OTA updates can ship JS but not new
// bundled assets — Metro's JS-side AssetRegistry lookup will succeed
// on the OTA bundle even when the native binary doesn't actually
// contain the file, so the Image then crashes when its native side
// tries to read the missing bytes. We instead gate strictly on the
// running binary's build number: only the build that actually shipped
// the asset (>=25) is allowed to render it.
const NATIVE_BUILD_NUMBER = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants").default;
    const raw =
      Constants?.nativeBuildVersion ??
      Constants?.expoConfig?.ios?.buildNumber ??
      Constants?.manifest?.ios?.buildNumber;
    const n = parseInt(String(raw ?? ""), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
})();
const CARD_STATIONERY: number | null =
  NATIVE_BUILD_NUMBER >= 25 ? require("../assets/images/card-stationery.avif") : null;

function CardPreviewModal({
  visible,
  onClose,
  cardTo,
  cardMessage,
  cardFrom,
  qrLink,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  cardTo: string;
  cardMessage: string;
  cardFrom: string;
  qrLink: string;
  colors: any;
}) {
  const t = useT();
  const headingFontMedium = useHeadingFont("500Medium");
  const headingFontRegular = useHeadingFont("400Regular");
  const { lang } = useLanguage();
  const isRtl = lang === "AR";
  const { width: winW, height: winH } = useWindowDimensions();
  const cardW = Math.min(winW - 40, 360);
  const cardH = Math.min(winH - 260, Math.round(cardW * 1.35));
  const trimmed = (cardMessage ?? "").trim();
  const len = trimmed.length;
  const messageFont = len === 0 ? 18 : len > 280 ? 13 : len > 180 ? 15 : len > 100 ? 17 : 19;
  const writingDirection = isRtl ? "rtl" : "ltr";
  const stationeryInk = "#00414e";
  const exportRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  // Only attempt to resolve the native share modules when the user
  // actually taps Share. Resolving them at modal mount-time is enough
  // for some older binaries (build 22) to crash inside the JS shim.
  const [shareNativeAvailable] = useState<boolean>(() => {
    try {
      const mods = loadShareModules();
      return !!(mods.captureRef && mods.Sharing);
    } catch {
      return false;
    }
  });
  const canShare = trimmed.length > 0 && shareNativeAvailable;

  const handleShare = async () => {
    if (!exportRef.current || sharing || !canShare) return;
    const mods = loadShareModules();
    const capture = mods.captureRef;
    const ShareMod = mods.Sharing;
    if (!capture || !ShareMod) {
      Alert.alert(t.previewCardShareUnavailableTitle, t.previewCardShareUnavailableMessage);
      return;
    }
    setSharing(true);
    try {
      const targetW = 1080;
      // Capture the off-screen export view (always mounted with the
      // watermark) so the live on-screen preview never flashes the
      // watermark.
      const uri = await capture(exportRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        width: targetW,
        height: Math.round(targetW * (cardH / cardW)),
      });
      const available = await ShareMod.isAvailableAsync();
      if (!available) {
        Alert.alert(t.previewCardShareUnavailableTitle, t.previewCardShareUnavailableMessage);
        return;
      }
      await ShareMod.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: t.previewCardShareDialogTitle,
        UTI: "public.png",
      });
    } catch {
      Alert.alert(t.previewCardShareErrorTitle, t.previewCardShareErrorMessage);
    } finally {
      setSharing(false);
    }
  };

  const renderCardBody = (includeWatermark: boolean) => (
    <>
      {CARD_STATIONERY != null ? (
        <Image
          source={CARD_STATIONERY}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: cardW, height: cardH }}
          contentFit="cover"
        />
      ) : null}
      {/* The stationery image's writable area sits below the
          "Presentail" header (~22% from top) and above the bottom
          decorative rule (~93% from top, i.e. ~7% from bottom). We
          centre this group on the card's geometric midpoint (50%) so
          the message itself sits at the visual centre of the card,
          rather than at the midpoint of the writable strip (which is
          biased low). To/From hug the top/bottom of the group with the
          message stretched flex:1 between them, so the multi-line
          message is centred around 50% of the card height. */}
      <View
        style={{
          position: "absolute",
          left: 26,
          right: 26,
          top: cardH * 0.25,
          bottom: cardH * 0.18,
          justifyContent: "space-between",
        }}
      >
        <AppText
          style={{
            fontFamily: headingFontMedium,
            fontSize: 18,
            color: stationeryInk,
            textAlign: "center",
            writingDirection,
            opacity: cardTo ? 1 : 0.55,
          }}
          numberOfLines={2}
        >
          {cardTo ? `${t.toLabel} ${cardTo}` : t.toLabel}
        </AppText>
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 4, paddingVertical: 14 }}>
          <AppText
            style={{
              fontFamily: headingFontRegular,
              fontSize: messageFont,
              color: stationeryInk,
              textAlign: "center",
              lineHeight: messageFont * 1.5,
              writingDirection,
              opacity: trimmed.length > 0 ? 1 : 0.55,
            }}
          >
            {trimmed.length > 0 ? trimmed : t.previewCardPlaceholder}
          </AppText>
        </View>
        <AppText
          style={{
            fontFamily: headingFontMedium,
            fontSize: 18,
            color: stationeryInk,
            textAlign: "center",
            writingDirection,
            opacity: cardFrom ? 1 : 0.55,
          }}
          numberOfLines={2}
        >
          {cardFrom ? `${t.fromLabel} ${cardFrom}` : t.fromLabel}
        </AppText>
      </View>
      {qrLink ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 40,
            ...(isRtl ? { left: 10 } : { right: 10 }),
          }}
        >
          <QRCode value={qrLink} size={56} color="#00414e" backgroundColor="transparent" />
        </View>
      ) : null}
      {includeWatermark ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 10,
            // Bottom-end corner: right in LTR, left in RTL.
            ...(isRtl ? { left: 14 } : { right: 14 }),
          }}
        >
          <AppText
            style={{
              fontFamily: headingFontMedium,
              fontSize: 11,
              color: colors.gold,
              opacity: 0.6,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            presentail.com
          </AppText>
        </View>
      ) : null}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.78)", alignItems: "center", justifyContent: "center", padding: 20 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ width: cardW, height: cardH, borderRadius: 14, overflow: "hidden", backgroundColor: "#0d3b3a" }}
        >
          {renderCardBody(false)}
        </Pressable>
        {/* Off-screen export-only clone, mounted only when the native
            share modules are available (build 25+). captureRef snapshots
            this view so the on-screen preview never shows the watermark.
            Skipped on build 22 where the native modules aren't linked,
            so we don't risk a duplicate Image render that could crash. */}
        {shareNativeAvailable ? (
          <View
            ref={exportRef}
            collapsable={false}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: -10000,
              top: 0,
              width: cardW,
              height: cardH,
              borderRadius: 14,
              overflow: "hidden",
              backgroundColor: "#0d3b3a",
            }}
          >
            {renderCardBody(true)}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
          {shareNativeAvailable ? (
            <Pressable
              onPress={handleShare}
              disabled={!canShare || sharing}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 22,
                paddingVertical: 11,
                borderRadius: 999,
                backgroundColor: colors.gold,
                opacity: !canShare || sharing ? 0.5 : 1,
              }}
            >
              <Feather name="share" size={14} color="#fff" />
              <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: "#fff" }}>
                {sharing ? t.previewCardSharing : t.previewCardShare}
              </AppText>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            style={{ paddingHorizontal: 22, paddingVertical: 11, borderRadius: 999, backgroundColor: "#fff" }}
          >
            <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}>
              {t.previewCardClose}
            </AppText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function QrLinkField({ colors, value, onChangeText, inputRef }: { colors: any; value: string; onChangeText: (v: string) => void; inputRef?: React.RefObject<TextInput | null> }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const isValid = (url: string) => {
    const trimmed = url.trim();
    return !trimmed || /^https?:\/\/.+/.test(trimmed);
  };
  return (
    <View style={{ gap: 4 }}>
      <Field
        colors={colors}
        label={t.qrLinkLabel}
        value={value}
        onChangeText={(v: string) => {
          onChangeText(v);
          if (error && isValid(v)) setError(null);
        }}
        onBlur={() => {
          if (!isValid(value)) {
            setError(t.qrLinkError);
          } else {
            setError(null);
          }
        }}
        placeholder={t.qrLinkPlaceholder}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        inputRef={inputRef}
        returnKeyType="done"
      />
      {error ? (
        <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#dc2626", paddingHorizontal: 2 }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

function CustomizeStep({ colors, cardTo, setCardTo, cardMessage, setCardMessage, cardFrom, setCardFrom, qrLink, setQrLink }: any) {
  const t = useT();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [suggestedOpen, setSuggestedOpen] = useState(false);
  const cardFromInputRef = useRef<TextInput>(null);
  const qrLinkInputRef = useRef<TextInput>(null);
  return (
    <Card colors={colors} title={t.cardMessageTitle}>
      <Field colors={colors} label={t.toLabel} value={cardTo} onChangeText={setCardTo} placeholder=""
        onSubmitEditing={() => cardFromInputRef.current?.focus()} />
      <Field
        colors={colors}
        label={t.cardMessageTitle}
        value={cardMessage}
        onChangeText={setCardMessage}
        placeholder=""
        multiline
        maxLength={400}
        characterCount
      />
      {/* Hide the entire preview flow on legacy build 22 — the stationery
          asset isn't bundled there and the modal has been crashing. The
          next binary (>=25) ships the asset and re-enables the button. */}
      {NATIVE_BUILD_NUMBER >= 25 ? (
        <>
          <Pressable
            onPress={() => setPreviewOpen(true)}
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.gold,
              backgroundColor: "#fff",
            }}
          >
            <Feather name="eye" size={14} color={colors.gold} />
            <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.gold }}>
              {t.previewCardButton}
            </AppText>
          </Pressable>
          {previewOpen ? (
            <CardPreviewModal
              visible={previewOpen}
              onClose={() => setPreviewOpen(false)}
              cardTo={cardTo}
              cardMessage={cardMessage}
              cardFrom={cardFrom}
              qrLink={qrLink && /^https?:\/\/.+/.test(qrLink.trim()) ? qrLink.trim() : ""}
              colors={colors}
            />
          ) : null}
        </>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Pressable
          onPress={() => setSuggestedOpen(true)}
          style={{ paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 11,
              color: colors.gold,
              textDecorationLine: "underline",
            }}
          >
            {t.notSureWhatToSay}
          </AppText>
        </Pressable>
      </View>
      <SuggestedMessagesSheet
        visible={suggestedOpen}
        onClose={() => setSuggestedOpen(false)}
        onSelect={setCardMessage}
        maxLength={400}
      />

      <Field colors={colors} label={t.fromLabel} value={cardFrom} onChangeText={setCardFrom} placeholder=""
        inputRef={cardFromInputRef}
        onSubmitEditing={() => qrLinkInputRef.current?.focus()} />

      <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, lineHeight: 18 }}>
        {t.qrLinkHint}
      </AppText>
      <QrLinkField colors={colors} value={qrLink} onChangeText={setQrLink} inputRef={qrLinkInputRef} />

      {qrLink && /^https?:\/\/.+/.test(qrLink.trim()) ? (
        <View style={{ alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
          <QRCode value={qrLink.trim()} size={140} color="#00414e" backgroundColor="#ffffff" />
          <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.gold, letterSpacing: 1.5, textTransform: "uppercase" }}>
            {t.qrPreview}
          </AppText>
          <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>
            {t.qrPrintedOnCard}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

// =============== Card Message Review (Step 3 / Payment) ===============

function CardMessageReviewCard({
  colors,
  cardMessage,
  setCardMessage,
}: {
  colors: any;
  cardMessage: string;
  setCardMessage: (v: string) => void;
}) {
  const t = useT();
  const { isRTL } = useLanguage();
  const [suggestedOpen, setSuggestedOpen] = useState(false);
  const trimmed = (cardMessage ?? "").trim();
  return (
    <Card colors={colors} title={t.cardMessageTitle}>
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: "#faf7f2",
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            lineHeight: 20,
            color: trimmed ? colors.primary : colors.mutedForeground,
            textAlign: isRTL ? "right" : "left",
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {trimmed || t.previewCardPlaceholder}
        </AppText>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Pressable
          onPress={() => setSuggestedOpen(true)}
          style={{ paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 11,
              color: colors.gold,
              textDecorationLine: "underline",
            }}
          >
            {t.notSureWhatToSay}
          </AppText>
        </Pressable>
      </View>
      <SuggestedMessagesSheet
        visible={suggestedOpen}
        onClose={() => setSuggestedOpen(false)}
        onSelect={setCardMessage}
        maxLength={400}
      />
    </Card>
  );
}

// =============== Step 2: Delivery Details ===============

const DeliveryDetailsStep = React.forwardRef(function DeliveryDetailsStep(props: any, ref: any) {
  const headingFontMedium = useHeadingFont("500Medium");
  const headingFontBold = useHeadingFont("700Bold");
  const {
    colors, scrollViewRef, showFieldErrors,
    recipientFirst, setRecipientFirst, recipientLast, setRecipientLast,
    recipientPhone, setRecipientPhone, recipientCountry, setRecipientCountry,
    recipientPhoneShowError,
    locationsLoading, districts, district, setDistrict, districtManuallyEdited, districtOpen, setDistrictOpen,
    noAddress, setNoAddress, deliveryDetails, setDeliveryDetails,
    isSignedIn, savedAddresses, activeAddressId, savedAddressPickerOpen, setSavedAddressPickerOpen, applySavedAddress,
    saveAddress, setSaveAddress,
    senderFirst, setSenderFirst, senderLast, setSenderLast, senderWhatsapp, setSenderWhatsapp,
    senderCountry, setSenderCountry,
    senderEmail, setSenderEmail, identitySecret, setIdentitySecret,
    hideSenderName, hideSenderEmail, hideSenderPhone, senderSummary, onEditAccount,
  } = props;

  const recipientNamesRef = useRef<View>(null);
  const recipientPhoneRef = useRef<View>(null);
  const deliveryDetailsRef = useRef<View>(null);
  const senderNamesRef = useRef<View>(null);
  const senderPhoneRef = useRef<View>(null);
  const senderEmailRef = useRef<View>(null);

  const recipientLastInputRef = useRef<TextInput>(null);
  const recipientPhoneInputRef = useRef<TextInput>(null);
  const senderFirstInputRef = useRef<TextInput>(null);
  const senderLastInputRef = useRef<TextInput>(null);
  const senderPhoneInputRef = useRef<TextInput>(null);
  const senderEmailInputRef = useRef<TextInput>(null);

  const scrollToRef = (fieldRef: React.RefObject<View | null>) => {
    if (!fieldRef.current || !scrollViewRef?.current) return;
    fieldRef.current.measureLayout(
      findNodeHandle(scrollViewRef.current) as number,
      (_x: number, y: number) => {
        scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
      },
      () => {},
    );
  };

  const focusAndScroll = (
    inputRef: React.RefObject<TextInput | null>,
    viewRef: React.RefObject<View | null>,
    delay = 50,
  ) => {
    inputRef.current?.focus();
    setTimeout(() => scrollToRef(viewRef), delay);
  };

  useImperativeHandle(ref, () => ({
    scrollToFirstError: () => {
      const phoneEmpty = !recipientPhone.trim();
      const phoneInvalid = !phoneEmpty && (() => {
        try { return !isValidPhoneNumber(recipientPhone.trim(), recipientCountry.code as CountryCode); } catch { return true; }
      })();
      if (!recipientFirst.trim() || !recipientLast.trim()) {
        scrollToRef(recipientNamesRef);
      } else if (phoneEmpty || phoneInvalid) {
        scrollToRef(recipientPhoneRef);
      } else if (!noAddress && !deliveryDetails.trim()) {
        scrollToRef(deliveryDetailsRef);
      } else if (!hideSenderName && (!senderFirst.trim() || !senderLast.trim())) {
        scrollToRef(senderNamesRef);
      } else if (!hideSenderPhone && !senderWhatsapp.trim()) {
        scrollToRef(senderPhoneRef);
      } else if (!hideSenderEmail && !senderEmail.trim()) {
        scrollToRef(senderEmailRef);
      }
    },
  }));
  const { formatPrice } = useCurrency();
  const t = useT();
  const { isRTL } = useLanguage();
  const activeAddress = activeAddressId != null
    ? (savedAddresses as CustomerAddress[]).find((a) => a.id === activeAddressId) ?? null
    : null;
  const activeAddressLabel = activeAddress
    ? (activeAddress.nickname || activeAddress.label || t.checkoutUseSavedAddress)
    : t.checkoutUseSavedAddress;
  return (
    <View style={{ gap: 18 }}>
      <Card colors={colors} title={t.recipientDetailsTitle}>
        {isSignedIn && savedAddresses.length > 0 ? (
          <Pressable
            onPress={() => setSavedAddressPickerOpen(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: activeAddressId != null ? colors.primary : colors.border,
              borderRadius: 10,
              backgroundColor: "#faf7f2",
            }}
          >
            <Feather name="map-pin" size={16} color={colors.gold} />
            <AppText style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }} numberOfLines={1}>
              {activeAddressLabel}
            </AppText>
            <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        <Modal
          visible={savedAddressPickerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setSavedAddressPickerOpen(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
            onPress={() => setSavedAddressPickerOpen(false)}
          />
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "#fff",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "72%",
              paddingBottom: 32,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f0ebe3" }}>
              <AppText style={{ fontFamily: headingFontBold, fontSize: 17, color: colors.primary }}>{t.checkoutSavedAddressPickerTitle}</AppText>
              <Pressable onPress={() => setSavedAddressPickerOpen(false)}>
                <Feather name="x" size={20} color={colors.primary} />
              </Pressable>
            </View>
            <FlatList
              data={savedAddresses}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => {
                const isActive = item.id === activeAddressId;
                return (
                  <TouchableOpacity
                    onPress={() => applySavedAddress(item)}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: "#f7f4ef",
                      gap: 4,
                      backgroundColor: isActive ? "#fdf9f3" : "#fff",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary, flex: 1 }}>
                        {item.nickname || item.label}
                      </AppText>
                      {item.isDefault ? (
                        <AppText style={{ color: colors.gold, fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 1 }}>
                          ★
                        </AppText>
                      ) : null}
                      {isActive ? (
                        <Feather name="check" size={14} color={colors.gold} />
                      ) : null}
                    </View>
                    <AppText style={{ color: colors.primary, fontFamily: "Inter_400Regular", fontSize: 13 }}>
                      {item.district}, {item.countryCode}
                    </AppText>
                    <AppText style={{ color: colors.mutedForeground, fontSize: 12 }}>
                      {item.addressLine}
                    </AppText>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </Modal>
        <View ref={recipientNamesRef} style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label={t.firstNameLabel} value={recipientFirst} onChangeText={setRecipientFirst} placeholder="" required error={showFieldErrors && !recipientFirst.trim()}
              onSubmitEditing={() => focusAndScroll(recipientLastInputRef, recipientNamesRef)} />
          </View>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label={t.lastNameLabel} value={recipientLast} onChangeText={setRecipientLast} placeholder="" required error={showFieldErrors && !recipientLast.trim()}
              inputRef={recipientLastInputRef}
              returnKeyType="next"
              onSubmitEditing={() => focusAndScroll(recipientPhoneInputRef, recipientPhoneRef)} />
          </View>
        </View>
        <View ref={recipientPhoneRef}>
          <PhoneField
            label={t.phoneNumberLabel}
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            countryCode={recipientCountry.code}
            onChangeCountry={setRecipientCountry}
            required
            showError={recipientPhoneShowError || (showFieldErrors && !recipientPhone.trim())}
            focusRef={recipientPhoneInputRef}
          />
        </View>
        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            gap: 12,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: noAddress ? colors.primary : colors.border,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          <Pressable
            onPress={() => setNoAddress(!noAddress)}
            style={{
              flex: 1,
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: noAddress ? colors.primary : "#f5f1ea",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather
                name="map-pin"
                size={18}
                color={noAddress ? "#fff" : colors.primary}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: colors.primary,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t.askRecipientForAddressTitle}
              </AppText>
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  lineHeight: 17,
                  color: colors.mutedForeground,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t.askRecipientForAddressNote}
              </AppText>
            </View>
          </Pressable>
          <Switch
            value={noAddress}
            onValueChange={setNoAddress}
            trackColor={{ false: "#e5dcc9", true: colors.primary }}
            thumbColor="#fff"
            ios_backgroundColor="#e5dcc9"
          />
        </View>

        {!noAddress ? (
        <View>
          <Label colors={colors} required>{t.districtLabel}</Label>
          {locationsLoading && districts.length === 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                backgroundColor: "#f9f9f9",
                paddingHorizontal: 14,
                paddingVertical: 13,
                opacity: 0.6,
              }}
            >
              <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground }}>
                {t.loading}
              </AppText>
              <Feather name="loader" size={16} color={colors.mutedForeground} />
            </View>
          ) : !locationsLoading && districts.length === 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                backgroundColor: "#f9f9f9",
                paddingHorizontal: 14,
                paddingVertical: 13,
                opacity: 0.6,
              }}
            >
              <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground }}>
                {t.districtNotAvailable}
              </AppText>
              <Feather name="alert-circle" size={16} color={colors.mutedForeground} />
            </View>
          ) : (
            <Pressable
              onPress={() => setDistrictOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                backgroundColor: "#fff",
                paddingHorizontal: 14,
                paddingVertical: 13,
              }}
            >
              <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}>
                {district?.name ?? ""}
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                  {district ? `${formatPrice(district.fee)} ${t.checkoutDeliverySuffix}` : ""}
                </AppText>
                <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
              </View>
            </Pressable>
          )}

          <Modal visible={districtOpen} transparent animationType="slide" onRequestClose={() => setDistrictOpen(false)}>
            <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setDistrictOpen(false)} />
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: "#fff",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: "72%",
                paddingBottom: 32,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f0ebe3" }}>
                <AppText style={{ fontFamily: headingFontBold, fontSize: 17, color: colors.primary }}>{t.selectDistrictTitle}</AppText>
                <Pressable onPress={() => setDistrictOpen(false)}>
                  <Feather name="x" size={20} color={colors.primary} />
                </Pressable>
              </View>
              <FlatList
                data={districts}
                keyExtractor={(item) => item.name}
                renderItem={({ item }) => {
                  const selected = item.name === district?.name;
                  const inactive = item.isActive === false;
                  if (inactive) {
                    return (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingHorizontal: 20,
                          paddingVertical: 14,
                          borderBottomWidth: 1,
                          borderBottomColor: "#f7f4ef",
                          backgroundColor: "rgba(0,0,0,0.015)",
                        }}
                      >
                        <View style={{ flexDirection: "column", gap: 2 }}>
                          <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 15, color: "rgba(0,0,0,0.35)" }}>
                            {item.name}
                          </AppText>
                          <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(0,0,0,0.3)" }}>
                            {t.deliveryCityUnavailable}
                          </AppText>
                        </View>
                      </View>
                    );
                  }
                  return (
                    <TouchableOpacity
                      onPress={() => { districtManuallyEdited.current = true; setDistrict(item); setDistrictOpen(false); }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingHorizontal: 20,
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: "#f7f4ef",
                        backgroundColor: selected ? "#f9f6f1" : "#fff",
                      }}
                    >
                      <AppText style={{ fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular", fontSize: 15, color: colors.primary }}>
                        {item.name}
                      </AppText>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.gold }}>{formatPrice(item.fee)}</AppText>
                        {selected && <Feather name="check" size={16} color={colors.gold} />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </Modal>
        </View>
        ) : null}

        {!noAddress ? (
        <Field
          colors={colors}
          label={t.addressFormAddressLine}
          value={deliveryDetails}
          onChangeText={setDeliveryDetails}
          placeholder={t.addressFormAddressLinePlaceholder}
          helper={t.addressFormAddressLineHint}
          required
          multiline
          error={showFieldErrors && !deliveryDetails.trim()}
          fieldRef={deliveryDetailsRef}
        />
        ) : null}

        {isSignedIn && !noAddress ? (
          <Pressable
            onPress={() => setSaveAddress(!saveAddress)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: saveAddress ? colors.gold : colors.border,
                backgroundColor: saveAddress ? colors.gold : "#fff",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {saveAddress ? <Feather name="check" size={12} color="#fff" /> : null}
            </View>
            <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary, flex: 1 }}>
              {t.checkoutSaveAddressToggle}
            </AppText>
          </Pressable>
        ) : null}
      </Card>

      <Card colors={colors} title={t.senderDetailsTitle}>
        {senderSummary ? (
          <View
            style={{
              backgroundColor: colors.background,
              padding: 12,
              borderRadius: 10,
              gap: 6,
            }}
          >
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 13,
                color: colors.primary,
              }}
            >
              {t.checkoutSendingAs.replace(
                "{summary}",
                [senderSummary.name, senderSummary.email, senderSummary.phone]
                  .filter((s: string) => s && s.trim())
                  .join(" · "),
              )}
            </AppText>
            <Pressable onPress={onEditAccount} hitSlop={8}>
              <AppText
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.primary,
                  textDecorationLine: "underline",
                }}
              >
                {t.checkoutEditInAccount}
              </AppText>
            </Pressable>
          </View>
        ) : null}
        {!hideSenderName ? (
          <View ref={senderNamesRef} style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field colors={colors} label={t.firstNameLabel} value={senderFirst} onChangeText={setSenderFirst} placeholder="" required error={showFieldErrors && !senderFirst.trim()}
                inputRef={senderFirstInputRef}
                onSubmitEditing={() => focusAndScroll(senderLastInputRef, senderNamesRef)} />
            </View>
            <View style={{ flex: 1 }}>
              <Field colors={colors} label={t.lastNameLabel} value={senderLast} onChangeText={setSenderLast} placeholder="" required error={showFieldErrors && !senderLast.trim()}
                inputRef={senderLastInputRef}
                returnKeyType={!hideSenderPhone || !hideSenderEmail ? "next" : "done"}
                onSubmitEditing={
                  !hideSenderPhone
                    ? () => focusAndScroll(senderPhoneInputRef, senderPhoneRef)
                    : !hideSenderEmail
                      ? () => focusAndScroll(senderEmailInputRef, senderEmailRef)
                      : undefined
                } />
            </View>
          </View>
        ) : null}
        {!hideSenderPhone ? (
          <View ref={senderPhoneRef}>
            <PhoneField
              label={t.whatsappNumberLabel}
              value={senderWhatsapp}
              onChangeText={setSenderWhatsapp}
              countryCode={senderCountry.code}
              onChangeCountry={setSenderCountry}
              placeholder="3000000"
              required
              showError={showFieldErrors && !senderWhatsapp.trim()}
              focusRef={senderPhoneInputRef}
              returnKeyType={hideSenderEmail ? "done" : "next"}
              onSubmitEditing={hideSenderEmail ? undefined : () => focusAndScroll(senderEmailInputRef, senderEmailRef)}
            />
          </View>
        ) : null}
        {!hideSenderEmail ? (
          <Field colors={colors} label={t.emailLabel} value={senderEmail} onChangeText={setSenderEmail} placeholder="" required keyboardType="email-address" error={showFieldErrors && !senderEmail.trim()} fieldRef={senderEmailRef}
            inputRef={senderEmailInputRef}
            returnKeyType="done" />
        ) : null}

        <Pressable
          onPress={() => setIdentitySecret(!identitySecret)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: colors.background,
            padding: 12,
            borderRadius: 10,
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              borderWidth: 1.5,
              borderColor: identitySecret ? colors.primary : colors.border,
              backgroundColor: identitySecret ? colors.primary : "#fff",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {identitySecret ? <Feather name="check" size={12} color="#fff" /> : null}
          </View>
          <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
            {t.keepIdentitySecretLabel}
          </AppText>
        </Pressable>
        {identitySecret && (
          <AppText style={{ fontSize: 12, color: "#6b7280", marginTop: 6, marginLeft: 28 }}>
            {t.keepIdentitySecretHint}
          </AppText>
        )}
      </Card>
    </View>
  );
});

function DeliveryTile({ colors, icon, title, subtitle, footer, active, disabled, onPress, onInfoPress }: any) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{
        flex: 1,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: disabled ? colors.border : active ? colors.primary : colors.border,
        backgroundColor: disabled ? "#f5f5f5" : "#fff",
        gap: 4,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {onInfoPress ? (
        <Pressable
          onPress={(e) => { e.stopPropagation(); onInfoPress(); }}
          hitSlop={8}
          style={{ position: "absolute", top: 6, right: 6 }}
        >
          <Feather name="info" size={13} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
      {icon ? (
        <Feather name={icon} size={14} color={disabled ? colors.mutedForeground : active ? colors.primary : colors.mutedForeground} />
      ) : null}
      <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: disabled ? colors.mutedForeground : colors.primary }}>
        {title}
      </AppText>
      <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
        {subtitle}
      </AppText>
      {footer ? (
        <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: disabled ? colors.mutedForeground : colors.gold }}>
          {footer}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function DeliveryTimeCard({
  colors, days, date, setDate, slot, setSlot,
  deliveryMode, setDeliveryMode, expressAvailable, timeSlots, slotsByDay, expressSurcharge, localHour,
}: any) {
  const { formatPrice } = useCurrency();
  const t = useT();
  const todayIso = days[0]?.iso;
  // When OS provides per-day slots, show only the slots for the selected date's
  // day of week. Fall back to the flat list when no per-day data is available.
  const activeDaySlots: TimeSlot[] = React.useMemo(() => {
    const byStart = (arr: TimeSlot[]) =>
      [...arr].sort((a, b) => (a.startHour ?? a.cutoffHour) - (b.startHour ?? b.cutoffHour));
    if (slotsByDay && date) {
      const weekday = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
      const daySlots = (slotsByDay as Record<string, TimeSlot[]>)[weekday];
      if (daySlots && daySlots.length > 0) return byStart(daySlots);
    }
    return byStart(timeSlots as TimeSlot[]);
  }, [slotsByDay, date, timeSlots]);
  const todayHasSlots = (timeSlots as TimeSlot[]).some((s) => s.cutoffHour > localHour);
  const disabledDates = todayHasSlots ? undefined : new Set<string>(todayIso ? [todayIso] : []);
  return (
    <Card colors={colors} title={t.deliveryTimeTitle}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {expressAvailable && (
          <DeliveryTile
            colors={colors}
            icon="zap"
            title={t.expressDelivery}
            subtitle={t.oneToThreeHrs}
            footer={`+${formatPrice(expressSurcharge)}`}
            active={deliveryMode === "express"}
            onPress={() => setDeliveryMode("express")}
            onInfoPress={() => Alert.alert(t.expressInfoPopupTitle, `${t.expressInfoPopupBody}\n\n+${formatPrice(expressSurcharge)}`)}
          />
        )}
        <DeliveryTile
          colors={colors}
          icon=""
          title={t.todayDelivery}
          subtitle={t.scheduledSlotLabel}
          active={deliveryMode === "today_slot"}
          disabled={!todayHasSlots}
          onPress={() => {
            if (!todayHasSlots) return;
            setDeliveryMode("today_slot");
            setDate(days[0].iso);
            const firstAvail = activeDaySlots.find((s: TimeSlot) => s.cutoffHour > localHour) ?? null;
            setSlot(firstAvail);
          }}
        />
        <DeliveryTile
          colors={colors}
          icon="calendar"
          title={t.chooseAnotherDateLabel}
          subtitle={t.andTimeSlotLabel}
          active={deliveryMode === "schedule"}
          onPress={() => setDeliveryMode("schedule")}
        />
      </View>
      {(deliveryMode === "schedule" || deliveryMode === "today_slot") ? (
        <View style={{ gap: 10 }}>
          {deliveryMode === "schedule" && (
            <DateStrip
              days={days}
              selectedDate={date}
              onSelectDate={(iso) => { setDate(iso); setSlot(null); }}
              colors={colors}
              disabledDates={disabledDates}
              moreLabel={t.dateStripMoreLabel}
            />
          )}
          <SlotPicker
            slots={activeDaySlots}
            selectedSlotLabel={slot?.label ?? null}
            date={date}
            todayIso={todayIso}
            localHour={localHour}
            onSelectSlot={setSlot}
            colors={colors}
          />
        </View>
      ) : null}
    </Card>
  );
}

function DeliverySummaryCard({ colors, days, date, slot, mode }: any) {
  const t = useT();
  const day = days.find((d: any) => d.iso === date);
  return (
    <Card colors={colors} title={t.deliverySummaryTitle}>
      <SummaryRow label={t.dateLabel} value={day?.full ?? date} colors={colors} />
      <SummaryRow
        label={t.timeLabel}
        value={mode === "express" ? t.expressDelivery : (slot || "—")}
        colors={colors}
      />
    </Card>
  );
}

function SummaryRow({ label, value, colors, accent, bold, highlight }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>{label}</AppText>
      <AppText
        style={{
          fontFamily: bold ? "Inter_700Bold" : "Inter_600SemiBold",
          fontSize: bold ? 16 : 13,
          color: highlight ? "#2e7d32" : accent ? colors.gold : colors.primary,
        }}
      >
        {value}
      </AppText>
    </View>
  );
}

// =============== Step 3: Payment ===============

function SecurityNote({ colors }: { colors: any }) {
  const t = useT();
  return (
    <View
      style={{
        borderRadius: 10,
        backgroundColor: colors.background,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Feather name="lock" size={14} color={colors.gold} />
      <AppText style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, lineHeight: 16 }}>
        {t.secureRedirectNote}
      </AppText>
    </View>
  );
}

function PaymentStep({ colors, orderNotes, setOrderNotes, payMethod, setPayMethod, email, setEmail, country, cardError, setCardError, scrollViewRef, walletSupported, isAuthenticated, saveCard, setSaveCard, savedPaymentMethods, selectedSavedCardId, setSelectedSavedCardId, onRemoveSavedCard }: any) {
  const { currencyCode } = useCurrency();
  const t = useT();
  const cardErrorViewRef = useRef<View>(null);
  const cardFieldRef = useRef<CardFieldInput.Methods>(null);

  useEffect(() => {
    if (!cardError || !cardErrorViewRef.current || !scrollViewRef?.current) return;
    const timer = setTimeout(() => {
      const node = findNodeHandle(scrollViewRef.current);
      if (!node) return;
      cardErrorViewRef.current?.measureLayout(
        node,
        (_x: number, y: number) => {
          scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
        },
        () => {},
      );
    }, 50);
    return () => clearTimeout(timer);
  }, [cardError, scrollViewRef]);

  // Only methods that are actually selectable for the active
  // currency + country are rendered — incompatible methods are simply
  // hidden (the parent's `nextPayMethodForCurrency` effect re-selects
  // a valid default when currency/country changes).
  const supports = (m: PayMethodId) =>
    isPayMethodSupported(m, currencyCode, { country });
  const tap = (m: PayMethodId) => {
    setPayMethod(m);
    if (m === "card") {
      // CardField is a native UIKit/Android view and is not in the RN Tab-key
      // focus order.  When a keyboard-only shopper activates the "Pay by card"
      // row (Space/Return), we programmatically focus the field so they can
      // start typing card details without needing to touch the screen.
      // A short delay lets React finish rendering the conditionally-shown
      // CardField before the native focus() call is made.
      setTimeout(() => cardFieldRef.current?.focus(), 150);
    }
  };

  return (
    <View testID="payment-options" style={{ gap: 18 }}>
      <Card colors={colors} title={t.noteForTeamTitle}>
        <Field colors={colors} label={t.orderNotesLabel} value={orderNotes} onChangeText={setOrderNotes} placeholder={t.anySpecialRequests} multiline />
      </Card>

      <Card colors={colors} title={t.waysToPayTitle}>
        <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: -4 }}>
          {t.secureAndEncrypted}
        </AppText>

        {(() => {
          // walletSupported === null  → probe not yet resolved; show rows
          //                             so they don't flash away on fast devices.
          // walletSupported === true  → device supports native wallet; show rows.
          // walletSupported === false → probe resolved unsupported; hide rows.
          const walletRowVisible = walletSupported !== false;
          const visible = {
            mamo: supports("mamo"),
            card: supports("card"),
            apple_pay: supports("apple_pay") && walletRowVisible,
            google_pay: supports("google_pay") && walletRowVisible,
            paypal: supports("paypal"),
            whish: supports("whish"),
            western: supports("western"),
          };
          // Defensive fallback: if no method passes (shouldn't happen
          // with the current tables), force-show card so the shopper
          // isn't stuck on an empty list.
          if (!Object.values(visible).some(Boolean)) visible.card = true;
          return (
            <>
              {visible.apple_pay ? (
        <PayOption
          colors={colors}
          active={payMethod === "apple_pay"}
          onPress={() => tap("apple_pay")}
          title={t.checkoutPayApplePay}
          payIcons="apple_pay"
        >
          {payMethod === "apple_pay" ? (
            <View style={{ gap: 12 }}>
              <Field colors={colors} label={t.emailForReceipt} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" returnKeyType="done" />
              <SecurityNote colors={colors} />
            </View>
          ) : null}
        </PayOption>
              ) : null}
              {visible.google_pay ? (
        <PayOption
          colors={colors}
          active={payMethod === "google_pay"}
          onPress={() => tap("google_pay")}
          title={t.checkoutPayGooglePay}
          payIcons="google_pay"
        >
          {payMethod === "google_pay" ? (
            <View style={{ gap: 12 }}>
              <Field colors={colors} label={t.emailForReceipt} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" returnKeyType="done" />
              <SecurityNote colors={colors} />
            </View>
          ) : null}
        </PayOption>

              ) : null}
              {visible.mamo ? (
                <PayOption
                  colors={colors}
                  active={payMethod === "mamo"}
                  onPress={() => tap("mamo")}
                  title={t.checkoutPayByCard}
                  payIcons="card"
                >
                  {payMethod === "mamo" ? <SecurityNote colors={colors} /> : null}
                </PayOption>
              ) : null}
              {visible.card ? (
        <PayOption
          colors={colors}
          active={payMethod === "card"}
          onPress={() => tap("card")}
          title={t.checkoutPayCard}
          payIcons="card"
        >
              {payMethod === "card" ? (
                <View style={{ gap: 12 }}>
                  {/* Saved card picker — only for authenticated shoppers with saved cards */}
                  {isAuthenticated && (savedPaymentMethods?.length ?? 0) > 0 && (
                    <View style={{ gap: 8 }}>
                      <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.foreground }}>
                        {t.checkoutSavedCards}
                      </AppText>
                      {(savedPaymentMethods as { id: string; brand: string; last4: string; expMonth: number; expYear: number }[]).map((pm) => {
                        const isSelected = selectedSavedCardId === pm.id;
                        const renderRightActions = () => (
                          <Pressable
                            onPress={() => onRemoveSavedCard?.(pm.id)}
                            style={{
                              backgroundColor: "#ef4444",
                              justifyContent: "center",
                              alignItems: "center",
                              width: 80,
                              borderRadius: 10,
                              marginLeft: 4,
                            }}
                          >
                            <Feather name="trash-2" size={18} color="#fff" />
                            <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "#fff", marginTop: 2 }}>
                              {t.checkoutRemoveSavedCard}
                            </AppText>
                          </Pressable>
                        );
                        return (
                          <Swipeable
                            key={pm.id}
                            renderRightActions={renderRightActions}
                            overshootRight={false}
                            friction={2}
                          >
                            <Pressable
                              onPress={() => setSelectedSavedCardId(isSelected ? null : pm.id)}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                borderRadius: 10,
                                borderWidth: 1.5,
                                borderColor: isSelected ? colors.primary : colors.border,
                                backgroundColor: isSelected ? colors.secondary : "#fff",
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                              }}
                            >
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                <View style={{
                                  width: 16, height: 16, borderRadius: 8, borderWidth: 2,
                                  borderColor: isSelected ? colors.primary : colors.mutedForeground,
                                  alignItems: "center", justifyContent: "center",
                                }}>
                                  {isSelected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />}
                                </View>
                                <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.foreground }}>
                                  {pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1)} {"\u00B7\u00B7\u00B7\u00B7"} {pm.last4}
                                </AppText>
                                <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                                  {pm.expMonth.toString().padStart(2, "0")}/{pm.expYear.toString().slice(-2)}
                                </AppText>
                              </View>
                            </Pressable>
                          </Swipeable>
                        );
                      })}
                      {!selectedSavedCardId && (
                        <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                          {t.checkoutOrEnterNewCard}
                        </AppText>
                      )}
                    </View>
                  )}

                  {/* New card fields — hidden when a saved card is selected */}
                  {!selectedSavedCardId && (
                    <>
                      {/* Stripe CardField — collects card number, expiry, and CVC
                          internally. confirmPayment reads the entered details
                          directly; no local state needed. The field stays mounted
                          after a decline so shoppers can correct details in place. */}
                      <CardField
                        ref={cardFieldRef}
                        postalCodeEnabled={false}
                        style={{ height: 50, width: "100%" }}
                        cardStyle={{
                          backgroundColor: "#ffffff",
                          textColor: colors.primary,
                          placeholderColor: colors.mutedForeground,
                          borderColor: cardError ? "#ef4444" : colors.border,
                          borderWidth: cardError ? 1.5 : 1,
                          borderRadius: 10,
                        }}
                        onFocus={() => { if (cardError) setCardError(null); }}
                      />
                      {/* Save card checkbox — only for authenticated shoppers */}
                      {isAuthenticated && (
                        <Pressable
                          onPress={() => setSaveCard(!saveCard)}
                          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                        >
                          <View style={{
                            width: 18, height: 18, borderRadius: 4,
                            borderWidth: 1.5,
                            borderColor: saveCard ? colors.primary : colors.border,
                            backgroundColor: saveCard ? colors.primary : "#fff",
                            alignItems: "center", justifyContent: "center",
                          }}>
                            {saveCard && (
                              <AppText style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold", lineHeight: 14 }}>✓</AppText>
                            )}
                          </View>
                          <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.foreground, flex: 1 }}>
                            {t.checkoutSaveCard}
                          </AppText>
                        </Pressable>
                      )}
                    </>
                  )}

                  {cardError ? (
                    <View ref={cardErrorViewRef} style={{ gap: 4 }}>
                      <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: "#ef4444" }}>
                        {cardError}
                      </AppText>
                      <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                        {t.checkoutCardDeclineHint}
                      </AppText>
                    </View>
                  ) : null}
                  <Field colors={colors} label={t.emailForReceipt} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" returnKeyType="done" />
                  <SecurityNote colors={colors} />
                </View>
              ) : null}
        </PayOption>

              ) : null}
              {visible.paypal ? (
        <PayOption
          colors={colors}
          active={payMethod === "paypal"}
          onPress={() => tap("paypal")}
          title="PayPal" // i18n-ignore
          payIcons="paypal"
        >
          {payMethod === "paypal" ? <SecurityNote colors={colors} /> : null}
        </PayOption>
              ) : null}
              {visible.whish ? (
        <PayOption
          colors={colors}
          active={payMethod === "whish"}
          onPress={() => tap("whish")}
          title="Whish Money" // i18n-ignore
          payIcons="whish"
        />
              ) : null}
              {visible.western ? (
        <PayOption
          colors={colors}
          active={payMethod === "western"}
          onPress={() => tap("western")}
          title="Western Union" // i18n-ignore
          payIcons="western"
        />
              ) : null}
            </>
          );
        })()}
      </Card>
    </View>
  );
}

// CardIcons and WalletIcons moved to @/components/PaymentBadges

function PayOption({ colors, active, onPress, title, badge, badgeColor, payIcons, children }: any) {
  // Unsupported methods are filtered out by the parent picker — every
  // option that reaches here is selectable.
  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.secondary : "#fff",
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={onPress}
        style={{
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: active ? colors.primary : colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {active ? <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.primary }} /> : null}
        </View>
        <AppText style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
          {title}
        </AppText>
        {badge ? (
          <View style={{ backgroundColor: badgeColor, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }}>
            <AppText style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff", letterSpacing: 0.5 }}>
              {badge}
            </AppText>
          </View>
        ) : null}
        {payIcons === "card" ? (
          <CardIcons />
        ) : payIcons === "apple_pay" ? (
          <ApplePayBadge />
        ) : payIcons === "google_pay" ? (
          <GooglePayBadge />
        ) : payIcons === "paypal" ? (
          <PayPalBadge />
        ) : payIcons === "whish" ? (
          <WhishBadge />
        ) : payIcons === "western" ? (
          <WesternUnionBadge />
        ) : null}
      </Pressable>
      {children ? <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View> : null}
    </View>
  );
}

// =============== Collapsible Order Summary ===============

function CollapsibleOrderSummary({ colors, detailed, fees, setQty, remove, coupon, setCoupon, couponOpen, setCouponOpen, showDeliveryFee, initialOpen = false }: any) {
  const { formatPrice, currencyCode } = useCurrency();
  const { isRTL } = useLanguage();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const [open, setOpen] = useState(initialOpen);
  const animValue = useRef(new Animated.Value(initialOpen ? 1 : 0)).current;

  const toggle = () => {
    const toValue = open ? 0 : 1;
    setOpen(!open);
    Animated.timing(animValue, {
      toValue,
      duration: 240,
      useNativeDriver: false,
    }).start();
  };

  const bodyMaxHeight = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 900],
  });
  const bodyOpacity = animValue.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => ({
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 18,
          paddingVertical: 14,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.mutedForeground }}>
          {t.checkoutOrderSummaryCard}
        </AppText>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
          <AppText style={{ fontFamily: headingFontMedium, fontSize: 15, color: colors.primary }}>
            {formatPrice(fees.grand)}
          </AppText>
          <Feather
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.mutedForeground}
          />
        </View>
      </Pressable>

      <Animated.View style={{ maxHeight: bodyMaxHeight, opacity: bodyOpacity, overflow: "hidden" }}>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18, gap: 12 }}>
          {detailed.map(({ product, qty, lineTotal }: any) => (
            <View key={product.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Image source={product.image} style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.muted }} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <AppText numberOfLines={1} style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
                  {product.name}
                </AppText>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 999, alignSelf: "flex-start" }}>
                  <Pressable onPress={() => setQty(product.id, Math.max(1, qty - 1))} style={styles.qtyMini}>
                    <Feather name="minus" size={11} color={colors.primary} />
                  </Pressable>
                  <AppText style={{ fontFamily: "Inter_600SemiBold", color: colors.primary, paddingHorizontal: 8, fontSize: 12 }}>{qty}</AppText>
                  <Pressable onPress={() => setQty(product.id, qty + 1)} style={styles.qtyMini}>
                    <Feather name="plus" size={11} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                {isDiscountActive(currencyCode, product.discountPriceValue, product.discountPriceAed) ? (
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <AppText style={{ fontFamily: headingFontMedium, fontSize: 14, color: "#e11d48" }}>
                      {formatPrice(lineTotal)}
                    </AppText>
                    <AppText style={{ fontFamily: headingFontMedium, fontSize: 12, color: colors.mutedForeground, textDecorationLine: "line-through" }}>
                      {formatPrice(product.priceValue * qty)}
                    </AppText>
                  </View>
                ) : (
                  <AppText style={{ fontFamily: headingFontMedium, fontSize: 14, color: colors.primary }}>
                    {formatPrice(lineTotal)}
                  </AppText>
                )}
                <Pressable onPress={() => remove(product.id)} hitSlop={6}>
                  <Feather name="x-circle" size={14} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
          ))}

          <Pressable onPress={() => setCouponOpen(!couponOpen)}>
            <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.gold }}>
              {t.checkoutHaveCoupon} <AppText style={{ textDecorationLine: "underline" }}>{t.checkoutEnterCode}</AppText>
            </AppText>
          </Pressable>
          {couponOpen ? (
            <Field colors={colors} value={coupon} onChangeText={setCoupon} placeholder={t.checkoutCouponPlaceholder} />
          ) : null}

          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
          <SummaryRow label={t.checkoutSubtotalLabel} value={formatPrice(fees.subtotal)} colors={colors} />
          {showDeliveryFee ? (
            <>
              <SummaryRow
                label={t.checkoutDeliveryFeeLabel}
                value={fees.districtFee === 0 ? t.checkoutFreeUpper : formatPrice(fees.districtFee)}
                colors={colors}
                highlight={fees.districtFee === 0}
              />
              {fees.expressFee > 0 ? (
                <SummaryRow label={t.checkoutExpressUpgradeLabel} value={formatPrice(fees.expressFee)} colors={colors} />
              ) : null}
            </>
          ) : null}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
          <SummaryRow label={t.checkoutTotalLabel} value={formatPrice(fees.grand)} colors={colors} bold />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  qtyMini: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
});

export default withRouteErrorBoundary(CheckoutScreen, "checkout");
