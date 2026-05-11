import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardIcons, WalletIcons } from "@/components/PaymentBadges";
import { PhoneField } from "@/components/PhoneField";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { COUNTRY_DIAL_CODES, type CountryDialCode } from "@/data/countryCodes";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { getCountryHour } from "@/lib/beirutTime";
import {
  AE_EXPRESS_SURCHARGE,
  LB_EXPRESS_SURCHARGE,
  dayLabels,
  expressSurchargeForCountry,
  resolveSlotLabel,
  timeSlotsForCountry,
  type TimeSlot,
} from "@/lib/delivery";
import { freeDeliveryThresholdUsd } from "@/lib/freeDelivery";
import { createMamoPayment, createPayPalOrder } from "@/lib/payments";
import {
  isPayMethodSupported,
  nextPayMethodForCurrency,
  type PayMethodId,
} from "@/lib/payMethods";
import { API_BASE, createStripeCheckoutSession } from "@/lib/stripe";
import { createWooOrder } from "@/lib/woo";
import { submitWooOrderWithRetry } from "@/lib/wooSubmit";
import { getDeviceId } from "@/services/notifications";

export {
  isPayMethodSupported,
  defaultPayMethodFor,
  nextPayMethodForCurrency,
  payMethodAvailability,
} from "@/lib/payMethods";
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

type District = { name: string; fee: number };
const LB_DISTRICTS: District[] = [
  { name: "Akkar", fee: 39 },
  { name: "Aley", fee: 19 },
  { name: "Baabda", fee: 11 },
  { name: "Baalbeck", fee: 39 },
  { name: "Batroun", fee: 19 },
  { name: "Bcharee", fee: 39 },
  { name: "Beirut", fee: 8 },
  { name: "Bent Jbeil", fee: 39 },
  { name: "Chouf", fee: 29 },
  { name: "Hasbaya", fee: 39 },
  { name: "Hermel", fee: 39 },
  { name: "Jbail", fee: 19 },
  { name: "Jezzine", fee: 29 },
  { name: "Kasserwan", fee: 11 },
  { name: "Koura", fee: 29 },
  { name: "Marjayoun", fee: 39 },
  { name: "Metn", fee: 11 },
  { name: "Minnieh-Dennaya", fee: 39 },
  { name: "Nabatieh", fee: 39 },
  { name: "Rechaya", fee: 39 },
  { name: "Saida", fee: 29 },
  { name: "Tripoli", fee: 29 },
  { name: "Tyre", fee: 39 },
  { name: "West Bekaa", fee: 39 },
  { name: "Zahle", fee: 29 },
  { name: "Zghorta", fee: 39 },
];
const AE_DISTRICTS: District[] = [
  { name: "Dubai", fee: 13.61 },
  { name: "Ras Al Khaimah", fee: 13.61 },
  { name: "Umm Al Quwain", fee: 13.61 },
  { name: "Fujairah", fee: 13.61 },
  { name: "Ajman", fee: 13.61 },
  { name: "Sharjah", fee: 13.61 },
  { name: "Abu Dhabi", fee: 13.61 },
];
const CY_DISTRICTS: District[] = [
  { name: "Larnaca", fee: 11 },
  { name: "Limassol", fee: 11 },
  { name: "Nicosia", fee: 11 },
  { name: "Paphos", fee: 11 },
];
function districtsForCountry(code?: string): District[] {
  if (code === "AE") return AE_DISTRICTS;
  if (code === "CY") return CY_DISTRICTS;
  return LB_DISTRICTS;
}

function CheckoutScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { detailed, total, clear, setQty, remove } = useCart();
  const { formatNative, currencyCode } = useCurrency();
  const { token: authToken } = useAuth();
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
  const [identitySecret, setIdentitySecret] = useState(false);
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

  const stepValid = (s: Step) => {
    if (s === 0) return true;
    if (s === 1)
      return (
        recipientFirst.trim() &&
        recipientLast.trim() &&
        recipientPhone.trim() &&
        (noAddress || deliveryDetails.trim()) &&
        senderFirst.trim() &&
        senderLast.trim() &&
        senderWhatsapp.trim() &&
        senderEmail.trim()
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
    if (!senderFirst.trim()) missing.push(t.checkoutMfSenderFirst);
    if (!senderLast.trim()) missing.push(t.checkoutMfSenderLast);
    if (!senderWhatsapp.trim()) missing.push(t.checkoutMfSenderWhatsapp);
    if (!senderEmail.trim()) missing.push(t.checkoutMfSenderEmail);
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
      phone: `${senderCountry.dial} ${senderWhatsapp}`.trim(),
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
        router.replace(buildResultPath("success", paymentRef));
      } else {
        // Keep cart intact so the customer can retry without rebuilding it.
        router.replace(buildResultPath("failed", paymentRef));
      }
    };

    const { deeplinkBase, successUrl, cancelUrl } = buildReturnUrls(orderId);

    if (payMethod === "card" || payMethod === "wallet") {
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

    if (payMethod === "mamo") {
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
              setPayMethod={setPayMethod}
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

function CustomizeStep({ colors, cardTo, setCardTo, cardMessage, setCardMessage, cardFrom, setCardFrom, qrLink, setQrLink }: any) {
  const t = useT();
  const presets = [
    t.checkoutSuggestedMessages,
    t.checkoutPresetMagicalBirthday,
    t.checkoutPresetThinkingOfYou,
    t.checkoutPresetWithLove,
  ];
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {presets.map((p, i) => (
          <Pressable
            key={p}
            onPress={() => (i === 0 ? null : setCardMessage(p))}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: i === 0 ? "transparent" : colors.border,
              backgroundColor: i === 0 ? "transparent" : "#fff",
            }}
          >
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: i === 0 ? colors.gold : colors.primary, textDecorationLine: i === 0 ? "underline" : "none" }}>
              {i === 0 ? t.notSureWhatToSay : p}
            </Text>
          </Pressable>
        ))}
      </View>

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
    senderFirst, setSenderFirst, senderLast, setSenderLast, senderWhatsapp, setSenderWhatsapp,
    senderCountry, setSenderCountry,
    senderEmail, setSenderEmail, identitySecret, setIdentitySecret,
    days, date, setDate, slot, setSlot, deliveryMode, setDeliveryMode,
    expressAvailable, timeSlots, expressSurcharge, localHour,
  } = props;
  const { formatNative } = useCurrency();
  const t = useT();
  const todayIso = days[0]?.iso;
  return (
    <View style={{ gap: 18 }}>
      <Card colors={colors} title={t.recipientDetailsTitle}>
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
        <Pressable
          onPress={() => setNoAddress(!noAddress)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              borderWidth: 1.5,
              borderColor: noAddress ? colors.primary : colors.border,
              backgroundColor: noAddress ? colors.primary : "#fff",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {noAddress ? <Feather name="check" size={12} color="#fff" /> : null}
          </View>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary, flex: 1 }}>
            {t.dontKnowAddressCheck}
          </Text>
        </Pressable>

        {noAddress ? (
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              lineHeight: 17,
              color: colors.mutedForeground,
              marginTop: 6,
              marginLeft: 26,
            }}
          >
            {t.dontKnowAddressNote}
          </Text>
        ) : null}

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
          label={t.deliveryDetailsField}
          value={deliveryDetails}
          onChangeText={setDeliveryDetails}
          placeholder={t.buildingFloorStreet}
          required
          multiline
        />
        ) : null}
      </Card>

      <Card colors={colors} title={t.senderDetailsTitle}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label={t.firstNameLabel} value={senderFirst} onChangeText={setSenderFirst} placeholder="" required />
          </View>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label={t.lastNameLabel} value={senderLast} onChangeText={setSenderLast} placeholder="" required />
          </View>
        </View>
        <PhoneField
          label={t.whatsappNumberLabel}
          value={senderWhatsapp}
          onChangeText={setSenderWhatsapp}
          countryCode={senderCountry.code}
          onChangeCountry={setSenderCountry}
          placeholder="3000000"
          required
        />
        <Field colors={colors} label={t.emailLabel} value={senderEmail} onChangeText={setSenderEmail} placeholder="" required keyboardType="email-address" />

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

        <View style={{ marginTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <MaterialCommunityIcons name="truck-fast" size={16} color={colors.primary} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.primary }}>
              {t.deliveryTimeTitle}
            </Text>
          </View>
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
            <View style={{ marginTop: 12, gap: 10 }}>
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
        </View>
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
        backgroundColor: disabled ? "#f5f5f5" : active ? colors.secondary : "#fff",
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

  // Each method is enabled iff the active currency is in its supported
  // list. Incompatible methods are shown disabled with a short reason
  // so customers understand why they cannot pick them — rather than
  // having the option silently disappear or override their selection.
  const supports = (m: PayMethodId) =>
    isPayMethodSupported(m, currencyCode, { country });
  const reason = (m: PayMethodId): string | undefined => {
    if (supports(m)) return undefined;
    if (m === "mamo") return t.checkoutPayDisabledMamo;
    if (m === "paypal" && country === "AE")
      return t.checkoutPayDisabledPaypalUae ?? t.checkoutPayDisabledGeneric;
    if ((m === "whish" || m === "western") && country !== "LB")
      return t.checkoutPayDisabledLebanonOnly ?? t.checkoutPayDisabledUsdOnly;
    if (m === "paypal" || m === "whish" || m === "western") return t.checkoutPayDisabledUsdOnly;
    return t.checkoutPayDisabledGeneric;
  };
  const tap = (m: PayMethodId) => {
    if (supports(m)) setPayMethod(m);
  };

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

        {country === "LB" && currencyCode !== "AED" ? null : (
          <PayOption
            colors={colors}
            active={payMethod === "mamo"}
            onPress={() => tap("mamo")}
            disabled={!supports("mamo")}
            disabledReason={reason("mamo")}
            title="Mamo — UAE Wallets & Cards"
            badge="AED"
            badgeColor="#007C5B"
          >
            {payMethod === "mamo" ? <SecurityNote colors={colors} /> : null}
          </PayOption>
        )}
        <PayOption
          colors={colors}
          active={payMethod === "card"}
          onPress={() => tap("card")}
          disabled={!supports("card")}
          disabledReason={reason("card")}
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

        <PayOption
          colors={colors}
          active={payMethod === "wallet"}
          onPress={() => tap("wallet")}
          disabled={!supports("wallet")}
          disabledReason={reason("wallet")}
          title={t.checkoutPayWallet}
          payIcons="wallet"
        >
          {payMethod === "wallet" ? (
            <View style={{ gap: 12 }}>
              <Field colors={colors} label={t.emailForReceipt} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
              <SecurityNote colors={colors} />
            </View>
          ) : null}
        </PayOption>

        <PayOption
          colors={colors}
          active={payMethod === "paypal"}
          onPress={() => tap("paypal")}
          disabled={!supports("paypal")}
          disabledReason={reason("paypal")}
          title="PayPal"
          badge="PP"
          badgeColor="#003087"
        >
          {payMethod === "paypal" ? <SecurityNote colors={colors} /> : null}
        </PayOption>

        <PayOption
          colors={colors}
          active={payMethod === "whish"}
          onPress={() => tap("whish")}
          disabled={!supports("whish")}
          disabledReason={reason("whish")}
          title="Whish Money"
          badge="whish"
          badgeColor="#E5302E"
        />
        <PayOption
          colors={colors}
          active={payMethod === "western"}
          onPress={() => tap("western")}
          disabled={!supports("western")}
          disabledReason={reason("western")}
          title="Western Union"
          badge="WU"
          badgeColor="#F8B400"
        />
      </Card>
    </View>
  );
}

// CardIcons and WalletIcons moved to @/components/PaymentBadges

function PayOption({ colors, active, onPress, title, badge, badgeColor, payIcons, children, disabled, disabledReason }: any) {
  // When disabled we render the option in a dimmed state with a short
  // reason underneath, instead of removing it from the list. Hiding
  // would silently change the available choices when the customer
  // switches currency, which is confusing and was the source of the
  // "selection mysteriously moved" bug.
  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.secondary : "#fff",
        overflow: "hidden",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
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
        {payIcons === "card" ? <CardIcons /> : payIcons === "wallet" ? <WalletIcons /> : null}
      </Pressable>
      {disabled && disabledReason ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12, marginTop: -4 }}>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
            {disabledReason}
          </Text>
        </View>
      ) : null}
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
