import { Feather } from "@expo/vector-icons";
import {
  createMyAddress,
  getListMyAddressesQueryKey,
  useListMyAddresses,
  type CustomerAddress,
} from "@workspace/api-client-react";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  FlatList,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardIcons, PayPalBadge, WalletIcons, WesternUnionBadge, WhishBadge } from "@/components/PaymentBadges";
import { SuggestedMessagesSheet } from "@/components/SuggestedMessagesSheet";
import { PhoneField } from "@/components/PhoneField";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { COUNTRY_DIAL_CODES, type CountryDialCode } from "@/data/countryCodes";
import { districtsForCountry, type District } from "@/data/districts";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import {
  AE_EXPRESS_SURCHARGE,
  LB_EXPRESS_SURCHARGE,
  dayLabels,
  expressSurchargeForCountry,
  getCountryHour,
  resolveSlotLabel,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";
import { freeDeliveryThresholdUsd } from "@/lib/freeDelivery";
import { createMamoPayment, createPayPalOrder } from "@/lib/payments";
import {
  isPayMethodSupported,
  nextPayMethodForCurrency,
  type PayMethodId,
} from "@workspace/pay-methods";
import { API_BASE, createStripeCheckoutSession } from "@/lib/stripe";
import { createWooOrder } from "@/lib/woo";
import { trackEvent } from "@/lib/analytics";
import { submitWooOrderWithRetry } from "@/lib/wooSubmit";
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
const STEPS = ["Customize", "Delivery Details", "Payment"] as const;

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

function freeDeliveryThresholdForCountry(code?: string): number {
  return freeDeliveryThresholdUsd(code);
}

function CheckoutScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { detailed, total, clear, setQty, remove } = useCart();
  const { formatNative, currencyCode } = useCurrency();
  const { token: authToken, user: authUser, updateProfile } = useAuth();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const t = useT();
  const effectiveCountry = resolveCountryCode(selectedCountry?.code, currencyCode);

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
  }, []);

  // Step 1 — Customize / Card Message
  const [recipientFirst, setRecipientFirst] = useState("");
  const [recipientLast, setRecipientLast] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientCountry, setRecipientCountry] = useState<CountryDialCode>(defaultDialCode);
  const [cardTo, setCardTo] = useState("");
  const [cardMessage, setCardMessage] = useState("");
  const [cardFrom, setCardFrom] = useState("");
  const [qrLink, setQrLink] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponOpen, setCouponOpen] = useState(false);

  // Step 2 — Delivery Details
  const districts = districtsForCountry(effectiveCountry);
  const cityDistrictMatch = selectedCity
    ? districts.find((d) => d.name === selectedCity.name)
    : null;
  const [district, setDistrict] = useState<District>(
    cityDistrictMatch ?? districts[0],
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
      const newSlots = timeSlotsForCountry(cc);
      const h = getCountryHour(cc);
      setSlot(newSlots.find(s => s.cutoffHour > h) ?? newSlots[0] ?? null);
      const newDial = COUNTRY_DIAL_CODES.find((d) => d.code === (cc ?? "LB")) ?? COUNTRY_DIAL_CODES[0];
      setRecipientCountry(newDial);
      setSenderCountry(newDial);
    }
    if (districtManuallyEdited.current) return;
    const list = districtsForCountry(resolveCountryCode(selectedCountry?.code, currencyCode));
    if (selectedCity) {
      const match = list.find((d) => d.name === selectedCity.name);
      if (match) {
        setDistrict(match);
        return;
      }
    }
    if (countryChanged) {
      setDistrict(list[0]);
    }
  }, [selectedCountry, selectedCity]);
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
  const savedAddressesQuery = useListMyAddresses({
    query: { queryKey: getListMyAddressesQueryKey(), enabled: !!authUser },
  });
  const savedAddresses = savedAddressesQuery.data?.addresses ?? [];
  const applySavedAddress = (addr: CustomerAddress) => {
    const matchedCountry = COUNTRY_DIAL_CODES.find(
      (c) => c.code === addr.countryCode,
    );
    if (matchedCountry) setRecipientCountry(matchedCountry);
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
      (d) => d.name.trim().toLowerCase() === addr.district.trim().toLowerCase(),
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
    setSavedAddressPickerOpen(false);
  };

  // Auto-apply the customer's default saved address once after sign-in,
  // when the picker hasn't been touched and the buyer hasn't started
  // typing an address themselves. The shopper can still pick a different
  // saved address (or clear and re-type) from the picker.
  const defaultAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (defaultAppliedRef.current) return;
    if (!authUser) return;
    if (savedAddresses.length === 0) return;
    if (deliveryDetails.trim() || noAddress) return;
    const def = savedAddresses.find((a) => a.isDefault) ?? null;
    if (!def) return;
    defaultAppliedRef.current = true;
    applySavedAddress(def);
    // applySavedAddress is stable enough for this one-shot effect; we
    // intentionally key only on the inputs that decide whether to apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, savedAddresses, districts]);
  const days = useMemo(() => dayLabels(t.checkoutDayToday, t.checkoutDayTomorrow), [t.checkoutDayToday, t.checkoutDayTomorrow]);
  const expressAvailable = useMemo(() => {
    const h = getCountryHour(effectiveCountry);
    return h >= 8 && h < 22;
  }, [effectiveCountry]);
  const timeSlots = timeSlotsForCountry(effectiveCountry);
  const expressSurcharge = expressSurchargeForCountry(effectiveCountry);
  const freeDeliveryThreshold = freeDeliveryThresholdForCountry(effectiveCountry);
  const deliverySelection = useDeliverySelection();
  const todayIso = days[0].iso;
  const defaultSlotForToday = useMemo<TimeSlot | null>(() => {
    const h = getCountryHour(effectiveCountry);
    return timeSlots.find((s) => s.cutoffHour > h) ?? null;
  }, [timeSlots, effectiveCountry]);

  const deliveryMode: "express" | "today_slot" | "schedule" =
    deliverySelection.mode ?? "today_slot";
  const date = deliverySelection.date ?? todayIso;
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
  // to the next available one). Keep it defensive: never throw.
  useEffect(() => {
    if (deliverySelection.mode == null) {
      deliverySelection.setSelection({
        mode: "today_slot",
        date: todayIso,
        slotLabel: defaultSlotForToday?.label ?? null,
      });
      return;
    }
    if (deliverySelection.mode === "today_slot") {
      const isToday = (deliverySelection.date ?? todayIso) === todayIso;
      const fixed = resolveSlotLabel(
        deliverySelection.slotLabel,
        timeSlots,
        isToday,
        getCountryHour(effectiveCountry),
      );
      if (fixed !== deliverySelection.slotLabel) {
        deliverySelection.setSlotLabel(fixed);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeSlots, effectiveCountry]);

  const setDeliveryMode = deliverySelection.setMode;
  const setDate = deliverySelection.setDate;
  const setSlot = deliverySelection.setSlot;

  // Step 3 — Payment
  const [orderNotes, setOrderNotes] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethodId>("card");

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

  const fees = useMemo(() => {
    const subtotal = total;
    const baseDeliveryFee = noAddress ? 35 : district.fee;
    const districtFee = subtotal >= freeDeliveryThreshold ? 0 : baseDeliveryFee;
    const expressFee = deliveryMode === "express" ? expressSurcharge : 0;
    const grand = subtotal + districtFee + expressFee;
    return { subtotal, districtFee, expressFee, grand };
  }, [total, deliveryMode, district, freeDeliveryThreshold, expressSurcharge, noAddress]);

  const isSignedIn = !!authUser;
  const senderNameRequired = !isSignedIn;
  const senderEmailRequired = !isSignedIn;
  const senderPhoneRequired = !hasProfilePhone;

  const stepValid = (s: Step) => {
    if (s === 0) return true;
    if (s === 1)
      return (
        recipientFirst.trim() &&
        recipientLast.trim() &&
        recipientPhone.trim() &&
        (noAddress || deliveryDetails.trim()) &&
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
    if (!noAddress && !deliveryDetails.trim()) missing.push(t.checkoutMfDeliveryAddress);
    if (senderNameRequired && !senderFirst.trim()) missing.push(t.checkoutMfSenderFirst);
    if (senderNameRequired && !senderLast.trim()) missing.push(t.checkoutMfSenderLast);
    if (senderPhoneRequired && !senderWhatsapp.trim()) missing.push(t.checkoutMfSenderWhatsapp);
    if (senderEmailRequired && !senderEmail.trim()) missing.push(t.checkoutMfSenderEmail);
    return missing;
  };

  const next = () => {
    if (!stepValid(step)) {
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
    district: district.name,
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
    cardFrom,
    cardTo,
    qrLink,
    orderNotes,
    paymentMethod: payMethod,
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
    const result = await submitWooOrderWithRetry({
      createWooOrder: () =>
        createWooOrder(
          { ...buildWooPayload(orderId), paymentRef },
          { authToken, filter: { countryCode: selectedCountry?.code, cityId: selectedCity?.id } },
        ),
      warn: (msg, meta) =>
        console.warn(`[checkout] ${msg}`, { orderId, ...(meta ?? {}) }),
    });
    return result.ok;
  };

  const placeOrder = async () => {
    if (paying) return;
    setPaying(true);
    const orderId = `PR-${Math.floor(100000 + Math.random() * 899999)}`;

    const slotLabel = slot?.label ?? "";
    const buildResultPath = (status: "success" | "failed", paymentRef?: string) => {
      const params = new URLSearchParams({
        orderId,
        total: String(fees.grand),
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
    const finishAfterPayment = async (paymentRef?: string) => {
      const ok = await submitWooOrder(orderId, paymentRef);
      if (ok) {
        // CartContext.clear() also clears the persisted delivery selection
        // via the onClear listener registered in DeliverySelectionContext, so
        // we don't need to call deliverySelection.clear() explicitly here.
        clear();
        // Best-effort save of the delivery address to the customer's profile
        // when they opted in. Never blocks order completion.
        if (saveAddress && authUser && !noAddress) {
          try {
            await createMyAddress({
              label: "home",
              nickname: null,
              countryCode: recipientCountry.code,
              district: district.name,
              addressLine: deliveryDetails.trim() || district.name,
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
          const phoneToSave = `${senderCountry.dial} ${senderWhatsapp}`.trim();
          updateProfile({ phone: phoneToSave }).catch((err) => {
            console.warn("[checkout] post-order phone save failed", {
              orderId,
              err: err?.message ?? String(err),
            });
          });
        }
        // Funnel terminal step: only emit once the WC order has actually
        // been created, never just because a payment session resolved.
        trackEvent({
          name: "order_placed",
          surface: "checkout",
          action: payMethod,
        });
        router.replace(buildResultPath("success", paymentRef));
      } else {
        // Keep cart intact so the customer can retry without rebuilding it.
        router.replace(buildResultPath("failed", paymentRef));
      }
    };

    const { deeplinkBase, successUrl, cancelUrl } = buildReturnUrls(orderId);

    // AED + wallet (Apple Pay / Google Pay) is served by Mamo's hosted
    // checkout, which exposes the wallet buttons on its own page. Route it
    // through the same Mamo flow as the "Pay by card" tile so we don't need
    // a separate native wallet integration just for UAE.
    const walletViaMamo = payMethod === "wallet" && currencyCode === "AED";

    if ((payMethod === "card" || payMethod === "wallet") && !walletViaMamo) {
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
        const outcome = await runHostedCheckout(session.url, deeplinkBase);
        if (outcome === "success") {
          await finishAfterPayment(session.id);
        } else {
          Alert.alert(t.checkoutPaymentCancelledTitle, t.checkoutPaymentCancelledStripe);
        }
        setPaying(false);
        return;
      }
      if (session.code === "stripe_not_configured") {
        Alert.alert(
          t.checkoutCardSoonTitle,
          t.checkoutCardSoonMsg,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(t.checkoutPaymentErrorTitle, session.message);
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
        district: district.name,
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
        const outcome = await runHostedCheckout(session.url, deeplinkBase);
        if (outcome === "success") {
          await finishAfterPayment(session.id);
        } else {
          Alert.alert(t.checkoutPaymentCancelledTitle, t.checkoutPaymentCancelledGeneric);
        }
        setPaying(false);
        return;
      }
      Alert.alert(t.checkoutMamoErrorTitle, session.code === "mamo_not_configured"
        ? t.checkoutMamoNotConfigured
        : session.message);
      setPaying(false);
      return;
    }

    if (payMethod === "paypal") {
      const session = await createPayPalOrder({
        items: detailed
          .filter(({ product }) => product.wcId != null)
          .map(({ product, qty }) => ({ wcId: product.wcId!, quantity: qty })),
        district: district.name,
        expressDelivery: deliveryMode === "express",
        noAddress,
        currency: currencyCode,
        returnUrl: successUrl,
        cancelUrl,
        orderId,
        storeContext: { countryCode: selectedCountry?.code, cityId: selectedCity?.id },
      });
      if (session.ok) {
        const outcome = await runHostedCheckout(session.url, deeplinkBase);
        if (outcome === "success") {
          await finishAfterPayment(session.id);
        } else {
          Alert.alert(t.checkoutPaymentCancelledTitle, t.checkoutPaymentCancelledGeneric);
        }
        setPaying(false);
        return;
      }
      Alert.alert(t.checkoutPaypalErrorTitle, session.code === "paypal_not_configured"
        ? t.checkoutPaypalNotConfigured
        : session.message);
      setPaying(false);
      return;
    }

    // Whish / Western Union: no online payment, but the WC order must
    // still be recorded reliably or the customer's offline payment will
    // never be reconciled. Surface a failure state if WC creation fails.
    await finishAfterPayment();
    setPaying(false);
  };

  if (detailed.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 }}>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: colors.primary, textAlign: "center" }}>
          {t.checkoutBagEmpty}
        </Text>
        <Pressable onPress={() => router.replace("/(tabs)/catalog")} style={{ marginTop: 14 }}>
          <Text style={{ color: colors.gold, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>
            {t.checkoutBrowseBoutique}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Brand bar */}
      <View
        style={{
          paddingTop: insets.top + 14,
          paddingBottom: 14,
          backgroundColor: colors.primary,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <Pressable
          onPress={() => (step === 0 ? router.back() : setStep(((step - 1) as Step)))}
          hitSlop={12}
          style={{ position: "absolute", left: 18, top: insets.top + 14, padding: 6 }}
        >
          <Feather name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: "#fff" }}>
          {t.checkoutBrandHeader}
        </Text>
      </View>

      {/* Stepper */}
      <View style={{ paddingHorizontal: 20, paddingVertical: 18, backgroundColor: "#fff", borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {([t.checkoutStep0, t.checkoutStep1, t.checkoutStep2] as const).map((label, i) => (
            <View key={label} style={{ alignItems: "center", flex: 1 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  alignItems: "center",
                  justifyContent: "center",
                  borderColor: i <= step ? colors.primary : colors.border,
                  backgroundColor: i < step ? colors.primary : "#fff",
                }}
              >
                {i < step ? (
                  <Feather name="check" size={14} color="#fff" />
                ) : (
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: i === step ? colors.primary : colors.mutedForeground }}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: i === step ? "Inter_600SemiBold" : "Inter_400Regular",
                  fontSize: 11,
                  color: i === step ? colors.primary : colors.mutedForeground,
                }}
              >
                {label}
              </Text>
              <View
                style={{
                  marginTop: 6,
                  height: 2,
                  width: "70%",
                  borderRadius: 1,
                  backgroundColor: i === step ? colors.primary : "transparent",
                }}
              />
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 220, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <>
            <OrderSummary
              colors={colors}
              detailed={detailed}
              fees={fees}
              setQty={setQty}
              remove={remove}
              coupon={coupon}
              setCoupon={setCoupon}
              couponOpen={couponOpen}
              setCouponOpen={setCouponOpen}
              showDeliveryFee={false}
            />
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
              colors={colors}
              recipientFirst={recipientFirst}
              setRecipientFirst={setRecipientFirst}
              recipientLast={recipientLast}
              setRecipientLast={setRecipientLast}
              recipientPhone={recipientPhone}
              setRecipientPhone={setRecipientPhone}
              recipientCountry={recipientCountry}
              setRecipientCountry={setRecipientCountry}
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
                }
                setPayMethod(m);
              }}
              email={senderEmail}
              setEmail={setSenderEmail}
              country={effectiveCountry}
            />
            <OrderSummary
              colors={colors}
              detailed={detailed}
              fees={fees}
              setQty={setQty}
              remove={remove}
              coupon={coupon}
              setCoupon={setCoupon}
              couponOpen={couponOpen}
              setCouponOpen={setCouponOpen}
              showDeliveryFee
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
          <Text
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
                  : `${t.payLabel} ${formatNative(fees.grand)}`}
          </Text>
          <Feather name={step === 2 ? "lock" : "arrow-right"} size={14} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// =============== Reusable bits ===============

function Label({ children, colors, required }: any) {
  return (
    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>
      {children}
      {required ? <Text style={{ color: "#c0392b" }}> *</Text> : null}
    </Text>
  );
}

function Field({ colors, label, value, onChangeText, placeholder, keyboardType, multiline, required, prefix, helper, maxLength, characterCount }: any) {
  return (
    <View style={{ gap: 4 }}>
      {label ? <Label colors={colors} required={required}>{label}</Label> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          paddingHorizontal: 12,
        }}
      >
        {prefix ? <Text style={{ fontFamily: "Inter_500Medium", color: colors.primary, marginRight: 6 }}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType={keyboardType}
          multiline={multiline}
          maxLength={maxLength}
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
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>{helper}</Text>
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
    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 4, textAlign: "right" }}>
      {maxLength - (value?.length ?? 0)} {t.checkoutCharsLeft}
    </Text>
  );
}

function Card({ children, colors, title }: any) {
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
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 18, color: colors.primary }}>
          {title}
        </Text>
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
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  cardTo: string;
  cardMessage: string;
  cardFrom: string;
  colors: any;
}) {
  const t = useT();
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
      <View style={{ flex: 1, padding: 26 }}>
        <View style={{ flex: 0.42 }} />
        <View style={{ flex: 0.58 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 18,
              color: stationeryInk,
              textAlign: "center",
              writingDirection,
              opacity: cardTo ? 1 : 0.55,
            }}
            numberOfLines={2}
          >
            {cardTo ? `${t.toLabel} ${cardTo}` : t.toLabel}
          </Text>
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 4, paddingVertical: 14 }}>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_400Regular",
                fontSize: messageFont,
                color: stationeryInk,
                textAlign: "center",
                lineHeight: messageFont * 1.5,
                writingDirection,
                opacity: trimmed.length > 0 ? 1 : 0.55,
              }}
            >
              {trimmed.length > 0 ? trimmed : t.previewCardPlaceholder}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 18,
              color: stationeryInk,
              textAlign: "center",
              writingDirection,
              opacity: cardFrom ? 1 : 0.55,
            }}
            numberOfLines={2}
          >
            {cardFrom ? `${t.fromLabel} ${cardFrom}` : t.fromLabel}
          </Text>
        </View>
      </View>
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
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 11,
              color: colors.gold,
              opacity: 0.6,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            presentail.com
          </Text>
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
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: "#fff" }}>
                {sharing ? t.previewCardSharing : t.previewCardShare}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            style={{ paddingHorizontal: 22, paddingVertical: 11, borderRadius: 999, backgroundColor: "#fff" }}
          >
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}>
              {t.previewCardClose}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function CustomizeStep({ colors, cardTo, setCardTo, cardMessage, setCardMessage, cardFrom, setCardFrom, qrLink, setQrLink }: any) {
  const t = useT();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [suggestedOpen, setSuggestedOpen] = useState(false);
  return (
    <Card colors={colors} title={t.cardMessageTitle}>
      <Field colors={colors} label={t.toLabel} value={cardTo} onChangeText={setCardTo} placeholder="" />
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
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.gold }}>
              {t.previewCardButton}
            </Text>
          </Pressable>
          {previewOpen ? (
            <CardPreviewModal
              visible={previewOpen}
              onClose={() => setPreviewOpen(false)}
              cardTo={cardTo}
              cardMessage={cardMessage}
              cardFrom={cardFrom}
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
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 11,
              color: colors.gold,
              textDecorationLine: "underline",
            }}
          >
            {t.notSureWhatToSay}
          </Text>
        </Pressable>
      </View>
      <SuggestedMessagesSheet
        visible={suggestedOpen}
        onClose={() => setSuggestedOpen(false)}
        onSelect={setCardMessage}
        maxLength={400}
      />

      <Field colors={colors} label={t.fromLabel} value={cardFrom} onChangeText={setCardFrom} placeholder="" />

      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, lineHeight: 18 }}>
        {t.qrLinkHint}
      </Text>
      <Field colors={colors} value={qrLink} onChangeText={setQrLink} placeholder="https://..." />

      {qrLink && qrLink.trim().length > 4 ? (
        <View style={{ alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
          <Image
            source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(qrLink.trim())}` }}
            style={{ width: 140, height: 140, borderRadius: 6 }}
            contentFit="contain"
          />
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.gold, letterSpacing: 1.5, textTransform: "uppercase" }}>
            {t.qrPreview}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>
            {t.qrPrintedOnCard}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

// =============== Step 2: Delivery Details ===============

function DeliveryDetailsStep(props: any) {
  const {
    colors, recipientFirst, setRecipientFirst, recipientLast, setRecipientLast,
    recipientPhone, setRecipientPhone, recipientCountry, setRecipientCountry,
    districts, district, setDistrict, districtManuallyEdited, districtOpen, setDistrictOpen,
    noAddress, setNoAddress, deliveryDetails, setDeliveryDetails,
    isSignedIn, savedAddresses, savedAddressPickerOpen, setSavedAddressPickerOpen, applySavedAddress,
    saveAddress, setSaveAddress,
    senderFirst, setSenderFirst, senderLast, setSenderLast, senderWhatsapp, setSenderWhatsapp,
    senderCountry, setSenderCountry,
    senderEmail, setSenderEmail, identitySecret, setIdentitySecret,
    hideSenderName, hideSenderEmail, hideSenderPhone, senderSummary, onEditAccount,
  } = props;
  const { formatNative } = useCurrency();
  const t = useT();
  const { isRTL } = useLanguage();
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
              borderColor: colors.border,
              borderRadius: 10,
              backgroundColor: "#faf7f2",
            }}
          >
            <Feather name="map-pin" size={16} color={colors.gold} />
            <Text style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
              {t.checkoutUseSavedAddress}
            </Text>
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
              <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 17, color: colors.primary }}>{t.checkoutSavedAddressPickerTitle}</Text>
              <Pressable onPress={() => setSavedAddressPickerOpen(false)}>
                <Feather name="x" size={20} color={colors.primary} />
              </Pressable>
            </View>
            <FlatList
              data={savedAddresses}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => applySavedAddress(item)}
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f7f4ef",
                    gap: 4,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary }}>
                      {item.nickname || item.label}
                    </Text>
                    {item.isDefault ? (
                      <Text style={{ color: colors.gold, fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 1 }}>
                        ★
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_400Regular", fontSize: 13 }}>
                    {item.district}, {item.countryCode}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    {[item.addressLine, item.building, item.apartment].filter(Boolean).join(" · ")}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </Modal>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label={t.firstNameLabel} value={recipientFirst} onChangeText={setRecipientFirst} placeholder="" required />
          </View>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label={t.lastNameLabel} value={recipientLast} onChangeText={setRecipientLast} placeholder="" required />
          </View>
        </View>
        <PhoneField
          label={t.phoneNumberLabel}
          value={recipientPhone}
          onChangeText={setRecipientPhone}
          countryCode={recipientCountry.code}
          onChangeCountry={setRecipientCountry}
          placeholder="3000000"
          required
        />
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
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: colors.primary,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t.askRecipientForAddressTitle}
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  lineHeight: 17,
                  color: colors.mutedForeground,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t.askRecipientForAddressNote}
              </Text>
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
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}>
              {district.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                {formatNative(district.fee)} {t.checkoutDeliverySuffix}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </View>
          </Pressable>

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
                <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 17, color: colors.primary }}>{t.selectDistrictTitle}</Text>
                <Pressable onPress={() => setDistrictOpen(false)}>
                  <Feather name="x" size={20} color={colors.primary} />
                </Pressable>
              </View>
              <FlatList
                data={districts}
                keyExtractor={(item) => item.name}
                renderItem={({ item }) => {
                  const selected = item.name === district.name;
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
                      <Text style={{ fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular", fontSize: 15, color: colors.primary }}>
                        {item.name}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.gold }}>{formatNative(item.fee)}</Text>
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
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary, flex: 1 }}>
              {t.checkoutSaveAddressToggle}
            </Text>
          </Pressable>
        ) : null}
      </Card>

      <Card colors={colors} title={t.senderDetailsTitle}>
        {senderSummary ? (
          <View
            style={{
              backgroundColor: colors.secondary,
              padding: 12,
              borderRadius: 10,
              gap: 6,
            }}
          >
            <Text
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
            </Text>
            <Pressable onPress={onEditAccount} hitSlop={8}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.primary,
                  textDecorationLine: "underline",
                }}
              >
                {t.checkoutEditInAccount}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {!hideSenderName ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field colors={colors} label={t.firstNameLabel} value={senderFirst} onChangeText={setSenderFirst} placeholder="" required />
            </View>
            <View style={{ flex: 1 }}>
              <Field colors={colors} label={t.lastNameLabel} value={senderLast} onChangeText={setSenderLast} placeholder="" required />
            </View>
          </View>
        ) : null}
        {!hideSenderPhone ? (
          <PhoneField
            label={t.whatsappNumberLabel}
            value={senderWhatsapp}
            onChangeText={setSenderWhatsapp}
            countryCode={senderCountry.code}
            onChangeCountry={setSenderCountry}
            placeholder="3000000"
            required
          />
        ) : null}
        {!hideSenderEmail ? (
          <Field colors={colors} label={t.emailLabel} value={senderEmail} onChangeText={setSenderEmail} placeholder="" required keyboardType="email-address" />
        ) : null}

        <Pressable
          onPress={() => setIdentitySecret(!identitySecret)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: colors.secondary,
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
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
            {t.keepIdentitySecretLabel}
          </Text>
        </Pressable>
      </Card>
    </View>
  );
}

function DeliveryTile({ colors, icon, title, subtitle, footer, active, disabled, onPress }: any) {
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
      {icon ? (
        <Feather name={icon} size={14} color={disabled ? colors.mutedForeground : active ? colors.primary : colors.mutedForeground} />
      ) : null}
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: disabled ? colors.mutedForeground : colors.primary }}>
        {title}
      </Text>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
        {subtitle}
      </Text>
      {footer ? (
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: disabled ? colors.mutedForeground : colors.gold }}>
          {footer}
        </Text>
      ) : null}
    </Pressable>
  );
}

function DeliveryTimeCard({
  colors, days, date, setDate, slot, setSlot,
  deliveryMode, setDeliveryMode, expressAvailable, timeSlots, expressSurcharge, localHour,
}: any) {
  const { formatNative } = useCurrency();
  const t = useT();
  const todayIso = days[0]?.iso;
  return (
    <Card colors={colors} title={t.deliveryTimeTitle}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <DeliveryTile
          colors={colors}
          icon="zap"
          title={t.expressDelivery}
          subtitle={t.oneToThreeHrs}
          footer={expressAvailable ? `+${formatNative(expressSurcharge)}` : t.opensAt8AM}
          active={deliveryMode === "express"}
          disabled={!expressAvailable}
          onPress={() => setDeliveryMode("express")}
        />
        <DeliveryTile
          colors={colors}
          icon=""
          title={t.todayDelivery}
          subtitle={t.scheduledSlotLabel}
          active={deliveryMode === "today_slot"}
          onPress={() => {
            setDeliveryMode("today_slot");
            setDate(days[0].iso);
            const firstAvail = timeSlots.find((s: TimeSlot) => s.cutoffHour > localHour) ?? null;
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map((d: any) => {
                const a = d.iso === date;
                return (
                  <Pressable
                    key={d.iso}
                    onPress={() => { setDate(d.iso); setSlot(null); }}
                    style={{
                      width: 56,
                      paddingVertical: 8,
                      borderRadius: 10,
                      alignItems: "center",
                      backgroundColor: a ? colors.primary : "#fff",
                      borderWidth: 1,
                      borderColor: a ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: a ? colors.goldSoft : colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1 }}>
                      {d.label}
                    </Text>
                    <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 16, color: a ? "#fff" : colors.primary }}>
                      {d.date}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {timeSlots.map((s: TimeSlot) => {
              const isToday = date === todayIso;
              const past = isToday && localHour >= s.cutoffHour;
              const active = slot?.label === s.label;
              return (
                <Pressable
                  key={s.label}
                  onPress={() => { if (!past) setSlot(s); }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : past ? colors.border : colors.border,
                    backgroundColor: active ? colors.primary : past ? "#f5f5f5" : "#fff",
                    opacity: past ? 0.55 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 12,
                      color: active ? "#fff" : past ? colors.mutedForeground : colors.primary,
                      textDecorationLine: past ? "line-through" : "none",
                    }}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>{label}</Text>
      <Text
        style={{
          fontFamily: bold ? "Inter_700Bold" : "Inter_600SemiBold",
          fontSize: bold ? 16 : 13,
          color: highlight ? "#2e7d32" : accent ? colors.gold : colors.primary,
        }}
      >
        {value}
      </Text>
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
        backgroundColor: colors.secondary,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Feather name="lock" size={14} color={colors.gold} />
      <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, lineHeight: 16 }}>
        {t.secureRedirectNote}
      </Text>
    </View>
  );
}

function PaymentStep({ colors, orderNotes, setOrderNotes, payMethod, setPayMethod, email, setEmail, country }: any) {
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVC, setCardCVC] = useState("");
  const [cardName, setCardName] = useState("");
  const { currencyCode } = useCurrency();
  const t = useT();

  // Only methods that are actually selectable for the active
  // currency + country are rendered — incompatible methods are simply
  // hidden (the parent's `nextPayMethodForCurrency` effect re-selects
  // a valid default when currency/country changes).
  const supports = (m: PayMethodId) =>
    isPayMethodSupported(m, currencyCode, { country });
  const tap = (m: PayMethodId) => setPayMethod(m);

  const fmtCardNumber = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 16);
    const parts: string[] = [];
    for (let i = 0; i < d.length; i += 4) parts.push(d.slice(i, i + 4));
    return parts.join(" ");
  };

  const fmtExpiry = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  return (
    <View style={{ gap: 18 }}>
      <Card colors={colors} title={t.noteForTeamTitle}>
        <Field colors={colors} label={t.orderNotesLabel} value={orderNotes} onChangeText={setOrderNotes} placeholder={t.anySpecialRequests} multiline />
      </Card>

      <Card colors={colors} title={t.waysToPayTitle}>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: -4 }}>
          {t.secureAndEncrypted}
        </Text>

        {(() => {
          const visible = {
            mamo: supports("mamo"),
            card: supports("card"),
            wallet: supports("wallet"),
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
                  <Field colors={colors} label={t.cardholderNameLabel} value={cardName} onChangeText={setCardName} placeholder={t.nameOnCard} />
                  <Field
                    colors={colors}
                    label={t.cardNumberLabel}
                    value={cardNumber}
                    onChangeText={(v: string) => setCardNumber(fmtCardNumber(v))}
                    placeholder="1234 5678 9012 3456"
                    keyboardType="number-pad"
                    maxLength={19}
                  />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field
                        colors={colors}
                        label={t.expiryLabel}
                        value={cardExpiry}
                        onChangeText={(v: string) => setCardExpiry(fmtExpiry(v))}
                        placeholder="MM/YY"
                        keyboardType="number-pad"
                        maxLength={5}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        colors={colors}
                        label={t.cvcLabel}
                        value={cardCVC}
                        onChangeText={(v: string) => setCardCVC(v.replace(/\D/g, "").slice(0, 4))}
                        placeholder="123"
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                      />
                    </View>
                  </View>
                  <Field colors={colors} label={t.emailForReceipt} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
                  <SecurityNote colors={colors} />
                </View>
              ) : null}
        </PayOption>

              ) : null}
              {visible.wallet ? (
        <PayOption
          colors={colors}
          active={payMethod === "wallet"}
          onPress={() => tap("wallet")}
          title={t.checkoutPayWallet}
          payIcons="wallet"
        >
          {payMethod === "wallet" ? (
            currencyCode === "AED" ? (
              // AED wallet routes through Mamo's hosted page (no Stripe
              // receipt-email step here — Mamo collects the email itself
              // and we already have the sender email from the delivery step).
              <SecurityNote colors={colors} />
            ) : (
              <View style={{ gap: 12 }}>
                <Field colors={colors} label={t.emailForReceipt} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
                <SecurityNote colors={colors} />
              </View>
            )
          ) : null}
        </PayOption>

              ) : null}
              {visible.paypal ? (
        <PayOption
          colors={colors}
          active={payMethod === "paypal"}
          onPress={() => tap("paypal")}
          title="PayPal"
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
          title="Whish Money"
          payIcons="whish"
        />
              ) : null}
              {visible.western ? (
        <PayOption
          colors={colors}
          active={payMethod === "western"}
          onPress={() => tap("western")}
          title="Western Union"
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
        <Text style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
          {title}
        </Text>
        {badge ? (
          <View style={{ backgroundColor: badgeColor, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff", letterSpacing: 0.5 }}>
              {badge}
            </Text>
          </View>
        ) : null}
        {payIcons === "card" ? (
          <CardIcons />
        ) : payIcons === "wallet" ? (
          <WalletIcons />
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

// =============== Order Summary ===============

function OrderSummary({ colors, detailed, fees, setQty, remove, coupon, setCoupon, couponOpen, setCouponOpen, showDeliveryFee }: any) {
  const { formatNative } = useCurrency();
  const t = useT();
  return (
    <Card colors={colors} title={t.checkoutOrderSummaryCard}>
      <View style={{ gap: 12 }}>
        {detailed.map(({ product, qty, lineTotal }: any) => (
          <View key={product.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image source={product.image} style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.muted }} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
                {product.name}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 999, alignSelf: "flex-start" }}>
                <Pressable onPress={() => setQty(product.id, Math.max(1, qty - 1))} style={styles.qtyMini}>
                  <Feather name="minus" size={11} color={colors.primary} />
                </Pressable>
                <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primary, paddingHorizontal: 8, fontSize: 12 }}>{qty}</Text>
                <Pressable onPress={() => setQty(product.id, qty + 1)} style={styles.qtyMini}>
                  <Feather name="plus" size={11} color={colors.primary} />
                </Pressable>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 14, color: colors.primary }}>
                {formatNative(lineTotal)}
              </Text>
              <Pressable onPress={() => remove(product.id)} hitSlop={6}>
                <Feather name="x-circle" size={14} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <Pressable onPress={() => setCouponOpen(!couponOpen)}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.gold }}>
          {t.checkoutHaveCoupon} <Text style={{ textDecorationLine: "underline" }}>{t.checkoutEnterCode}</Text>
        </Text>
      </Pressable>
      {couponOpen ? (
        <Field colors={colors} value={coupon} onChangeText={setCoupon} placeholder={t.checkoutCouponPlaceholder} />
      ) : null}

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
      <SummaryRow label={t.checkoutSubtotalLabel} value={formatNative(fees.subtotal)} colors={colors} />
      {showDeliveryFee ? (
        <>
          <SummaryRow
            label={t.checkoutDeliveryFeeLabel}
            value={fees.districtFee === 0 ? t.checkoutFreeUpper : formatNative(fees.districtFee)}
            colors={colors}
            highlight={fees.districtFee === 0}
          />
          {fees.expressFee > 0 ? (
            <SummaryRow label={t.checkoutExpressDeliveryLabel} value={formatNative(fees.expressFee)} colors={colors} />
          ) : null}
        </>
      ) : null}
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
      <SummaryRow label={t.checkoutTotalLabel} value={formatNative(fees.grand)} colors={colors} bold />
    </Card>
  );
}

const styles = StyleSheet.create({
  qtyMini: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
});

export default withRouteErrorBoundary(CheckoutScreen, "checkout");
