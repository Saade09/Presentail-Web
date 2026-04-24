import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
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

import { PhoneField } from "@/components/PhoneField";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { COUNTRY_DIAL_CODES, type CountryDialCode } from "@/data/countryCodes";
import { useColors } from "@/hooks/useColors";
import { createMamoPayment, createPayPalOrder } from "@/lib/payments";
import { createStripeCheckoutSession } from "@/lib/stripe";
import { createWooOrder } from "@/lib/woo";

type Step = 0 | 1 | 2;
const STEPS = ["Customize", "Delivery Details", "Payment"] as const;
const EXPRESS_SURCHARGE = 15;

type District = { name: string; fee: number };
const DISTRICTS: District[] = [
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

type TimeSlot = { label: string; cutoffHour: number };
const TIME_SLOTS: TimeSlot[] = [
  { label: "9:00 AM – 2:00 PM", cutoffHour: 9 },
  { label: "2:00 PM – 6:00 PM", cutoffHour: 14 },
  { label: "6:00 PM – 9:00 PM", cutoffHour: 18 },
  { label: "9:00 PM – 11:00 PM", cutoffHour: 21 },
];

function getBeirutHour(): number {
  try {
    const now = new Date();
    const h = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Beirut",
      hour: "numeric",
      hour12: false,
    }).format(now);
    return parseInt(h, 10);
  } catch {
    return (new Date().getUTCHours() + 2) % 24;
  }
}

function dayLabels() {
  const out: { iso: string; label: string; day: string; date: string; full: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 10; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      label: i === 0 ? "Today" : i === 1 ? "Tom" : d.toLocaleDateString(undefined, { weekday: "short" }),
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      date: String(d.getDate()),
      full: d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    });
  }
  return out;
}

export default function CheckoutScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { detailed, total, clear, setQty, remove } = useCart();
  const { formatPrice, currencyCode, convert } = useCurrency();

  const LB = COUNTRY_DIAL_CODES.find((c) => c.code === "LB") ?? COUNTRY_DIAL_CODES[0];

  const [step, setStep] = useState<Step>(0);

  // Step 1 — Customize / Card Message
  const [recipientFirst, setRecipientFirst] = useState("");
  const [recipientLast, setRecipientLast] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientCountry, setRecipientCountry] = useState<CountryDialCode>(LB);
  const [cardTo, setCardTo] = useState("");
  const [cardMessage, setCardMessage] = useState("");
  const [cardFrom, setCardFrom] = useState("");
  const [qrLink, setQrLink] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponOpen, setCouponOpen] = useState(false);

  // Step 2 — Delivery Details
  const [district, setDistrict] = useState<District>(DISTRICTS.find(d => d.name === "Beirut")!);
  const [districtOpen, setDistrictOpen] = useState(false);
  const [noAddress, setNoAddress] = useState(false);
  const [deliveryDetails, setDeliveryDetails] = useState("");
  const [senderFirst, setSenderFirst] = useState("");
  const [senderLast, setSenderLast] = useState("");
  const [senderWhatsapp, setSenderWhatsapp] = useState("");
  const [senderCountry, setSenderCountry] = useState<CountryDialCode>(LB);
  const [senderEmail, setSenderEmail] = useState("");
  const [identitySecret, setIdentitySecret] = useState(false);
  const days = useMemo(dayLabels, []);
  const expressAvailable = useMemo(() => {
    const h = getBeirutHour();
    return h >= 8 && h < 22;
  }, []);
  const [deliveryMode, setDeliveryMode] = useState<"express" | "today_slot" | "schedule">("today_slot");
  const [date, setDate] = useState(days[0].iso);
  const [slot, setSlot] = useState<TimeSlot | null>(() => {
    const bh = getBeirutHour();
    return TIME_SLOTS.find(s => s.cutoffHour > bh) ?? null;
  });

  // Step 3 — Payment
  const [orderNotes, setOrderNotes] = useState("");
  const [payMethod, setPayMethod] = useState<"card" | "wallet" | "whish" | "western" | "mamo" | "paypal">("card");

  useEffect(() => {
    if (currencyCode === "AED") {
      setPayMethod("mamo");
    } else if (payMethod === "mamo") {
      setPayMethod("card");
    }
  }, [currencyCode]);

  const [paying, setPaying] = useState(false);

  const fees = useMemo(() => {
    const subtotal = total;
    const districtFee = subtotal >= 130 ? 0 : district.fee;
    const expressFee = deliveryMode === "express" ? EXPRESS_SURCHARGE : 0;
    const grand = subtotal + districtFee + expressFee;
    return { subtotal, districtFee, expressFee, grand };
  }, [total, deliveryMode, district]);

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
    if (!recipientFirst.trim()) missing.push("Recipient first name");
    if (!recipientLast.trim()) missing.push("Recipient last name");
    if (!recipientPhone.trim()) missing.push("Recipient phone number");
    if (!noAddress && !deliveryDetails.trim()) missing.push("Delivery address");
    if (!senderFirst.trim()) missing.push("Your first name");
    if (!senderLast.trim()) missing.push("Your last name");
    if (!senderWhatsapp.trim()) missing.push("Your WhatsApp number");
    if (!senderEmail.trim()) missing.push("Your email address");
    return missing;
  };

  const next = () => {
    if (!stepValid(step)) {
      const missing = getMissingFields();
      if (missing.length > 0) {
        Alert.alert(
          "Please complete the form",
          `Missing required fields:\n• ${missing.join("\n• ")}`,
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
      wcId: (product as any).wcId as number | undefined,
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
    deliveryDetails: noAddress ? "To be confirmed" : deliveryDetails,
    deliveryDate: date,
    deliverySlot: slot?.label ?? "",
    cardMessage,
    cardFrom,
    cardTo,
    qrLink,
    orderNotes,
    paymentMethod: payMethod,
    identitySecret,
  });

  const placeOrder = async () => {
    if (paying) return;
    setPaying(true);
    const orderId = `PR-${Math.floor(100000 + Math.random() * 899999)}`;

    const slotLabel = slot?.label ?? "";
    const successPath = `/order-confirmed?orderId=${orderId}&total=${fees.grand}&date=${date}&slot=${encodeURIComponent(
      slotLabel
    )}&recipient=${encodeURIComponent(`${recipientFirst} ${recipientLast}`)}`;

    // Always create WooCommerce order (fire-and-forget; don't block UX on failure)
    createWooOrder(buildWooPayload(orderId)).catch(() => {/* silent */});

    if (payMethod === "card" || payMethod === "wallet") {
      // Try real Stripe Checkout if configured
      const successUrl =
        (typeof window !== "undefined" ? window.location.origin : "https://presentail.app") + successPath;
      const cancelUrl =
        (typeof window !== "undefined" ? window.location.origin : "https://presentail.app") + "/cart";
      const session = await createStripeCheckoutSession({
        items: detailed.map(({ product, qty }) => ({
          name: product.name,
          description: product.description ?? undefined,
          amount: Math.round(product.priceValue * 100),
          quantity: qty,
        })),
        email: senderEmail,
        metadata: {
          orderId,
          recipient: `${recipientFirst} ${recipientLast}`,
          date,
          slot: slotLabel,
        },
        successUrl,
        cancelUrl,
      });
      if (session.ok) {
        clear();
        await WebBrowser.openBrowserAsync(session.url);
        router.replace(successPath as any);
        setPaying(false);
        return;
      }
      // Fallback if Stripe not configured
      if (session.code === "stripe_not_configured") {
        Alert.alert(
          "Card payments coming soon",
          "We're finalising the Stripe setup for your account. Your order is reserved — we'll confirm by SMS shortly.",
          [{ text: "Continue" }]
        );
      } else {
        Alert.alert("Payment error", session.message);
      }
    }

    if (payMethod === "mamo") {
      const origin = typeof window !== "undefined" ? window.location.origin : "https://presentail.app";
      const mamoReturn = origin + successPath;
      const mamoFail = origin + "/cart";
      const aedAmount = Math.round(convert(fees.grand) * 100) / 100;
      const session = await createMamoPayment({
        amount: aedAmount,
        title: `Presentail — ${orderId}`,
        description: `${recipientFirst} ${recipientLast} · ${date}`,
        email: senderEmail || undefined,
        firstName: senderFirst || undefined,
        lastName: senderLast || undefined,
        returnUrl: mamoReturn,
        failureReturnUrl: mamoFail,
      });
      if (session.ok) {
        clear();
        await WebBrowser.openBrowserAsync(session.url);
        router.replace(successPath as any);
        setPaying(false);
        return;
      }
      Alert.alert("Mamo error", session.code === "mamo_not_configured"
        ? "Mamo payments are being set up. Your order is reserved — we'll confirm by SMS."
        : session.message);
    }

    if (payMethod === "paypal") {
      const origin = typeof window !== "undefined" ? window.location.origin : "https://presentail.app";
      const ppReturn = origin + successPath;
      const ppCancel = origin + "/cart";
      const session = await createPayPalOrder({
        amount: fees.grand,
        currency: "USD",
        returnUrl: ppReturn,
        cancelUrl: ppCancel,
        orderId,
      });
      if (session.ok) {
        clear();
        await WebBrowser.openBrowserAsync(session.url);
        router.replace(successPath as any);
        setPaying(false);
        return;
      }
      Alert.alert("PayPal error", session.code === "paypal_not_configured"
        ? "PayPal payments are being set up. Your order is reserved — we'll confirm by SMS."
        : session.message);
    }

    // Whish / Western Union / fallback: navigate to confirmed screen
    clear();
    router.replace(successPath as any);
    setPaying(false);
  };

  if (detailed.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 }}>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: colors.primary }}>
          Your bag is empty
        </Text>
        <Pressable onPress={() => router.replace("/(tabs)/catalog" as any)} style={{ marginTop: 14 }}>
          <Text style={{ color: colors.gold, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase" }}>
            Browse the boutique
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
          Presentail
        </Text>
      </View>

      {/* Stepper */}
      <View style={{ paddingHorizontal: 20, paddingVertical: 18, backgroundColor: "#fff", borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {STEPS.map((label, i) => (
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
              district={district}
              setDistrict={setDistrict}
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
              ? "Continue to Delivery"
              : step === 1
                ? "Continue to Payment"
                : paying
                  ? "Processing…"
                  : `Pay ${formatPrice(fees.grand)}`}
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
            ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
          }}
        />
      </View>
      {helper ? (
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>{helper}</Text>
      ) : null}
      {characterCount && maxLength ? (
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 4, textAlign: "right" }}>
          {maxLength - (value?.length ?? 0)} characters left
        </Text>
      ) : null}
    </View>
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
  const presets = [
    "Try Suggested Messages",
    "Wishing you a magical birthday.",
    "Thinking of you today.",
    "With all my love.",
  ];
  return (
    <Card colors={colors} title="Card Message">
      <Field colors={colors} label="To" value={cardTo} onChangeText={setCardTo} placeholder="" />
      <Field
        colors={colors}
        label="Card message"
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
              {i === 0 ? "Not sure what to say? Try Suggested Messages" : p}
            </Text>
          </Pressable>
        ))}
      </View>

      <Field colors={colors} label="From" value={cardFrom} onChangeText={setCardFrom} placeholder="" />

      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, lineHeight: 18 }}>
        Paste a link to a video or photo from the internet. A QR code will be automatically added to your card message. No extra cost!
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
            Preview
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>
            This QR code will be printed on your gift card
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
    district, setDistrict, districtOpen, setDistrictOpen,
    noAddress, setNoAddress, deliveryDetails, setDeliveryDetails,
    senderFirst, setSenderFirst, senderLast, setSenderLast, senderWhatsapp, setSenderWhatsapp,
    senderCountry, setSenderCountry,
    senderEmail, setSenderEmail, identitySecret, setIdentitySecret,
    days, date, setDate, slot, setSlot, deliveryMode, setDeliveryMode,
    expressAvailable,
  } = props;
  const { formatPrice } = useCurrency();
  const beirutHour = getBeirutHour();
  const todayIso = days[0]?.iso;
  return (
    <View style={{ gap: 18 }}>
      <Card colors={colors} title="Recipient Details">
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label="First name" value={recipientFirst} onChangeText={setRecipientFirst} placeholder="" required />
          </View>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label="Last name" value={recipientLast} onChangeText={setRecipientLast} placeholder="" required />
          </View>
        </View>
        <PhoneField
          label="Phone Number"
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
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary }}>
            I don't know the address, please contact the recipient.
          </Text>
        </Pressable>

        <View>
          <Label colors={colors} required>District</Label>
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
                {formatPrice(district.fee)} delivery
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
                <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 17, color: colors.primary }}>Select District</Text>
                <Pressable onPress={() => setDistrictOpen(false)}>
                  <Feather name="x" size={20} color={colors.primary} />
                </Pressable>
              </View>
              <FlatList
                data={DISTRICTS}
                keyExtractor={(item) => item.name}
                renderItem={({ item }) => {
                  const selected = item.name === district.name;
                  return (
                    <TouchableOpacity
                      onPress={() => { setDistrict(item); setDistrictOpen(false); }}
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
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.gold }}>{formatPrice(item.fee)}</Text>
                        {selected && <Feather name="check" size={16} color={colors.gold} />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </Modal>
        </View>

        <Field
          colors={colors}
          label="Delivery details"
          value={deliveryDetails}
          onChangeText={setDeliveryDetails}
          placeholder={noAddress ? "I don't know the address" : "Building, floor, street, area"}
          required={!noAddress}
          multiline
        />
      </Card>

      <Card colors={colors} title="Sender Details">
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label="First name" value={senderFirst} onChangeText={setSenderFirst} placeholder="" required />
          </View>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label="Last name" value={senderLast} onChangeText={setSenderLast} placeholder="" required />
          </View>
        </View>
        <PhoneField
          label="WhatsApp number"
          value={senderWhatsapp}
          onChangeText={setSenderWhatsapp}
          countryCode={senderCountry.code}
          onChangeCountry={setSenderCountry}
          placeholder="3000000"
          required
        />
        <Field colors={colors} label="Email" value={senderEmail} onChangeText={setSenderEmail} placeholder="" required keyboardType="email-address" />

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
            Keep my identity secret.
          </Text>
        </Pressable>

        <View style={{ marginTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <MaterialCommunityIcons name="truck-fast" size={16} color={colors.primary} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.primary }}>
              Delivery Time
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <DeliveryTile
              colors={colors}
              icon="zap"
              title="Express Delivery"
              subtitle="1–3 hrs"
              footer={expressAvailable ? `+$${EXPRESS_SURCHARGE}` : "Opens 8 AM"}
              active={deliveryMode === "express"}
              disabled={!expressAvailable}
              onPress={() => setDeliveryMode("express")}
            />
            <DeliveryTile
              colors={colors}
              icon=""
              title="Today"
              subtitle="Scheduled Slot"
              active={deliveryMode === "today_slot"}
              onPress={() => {
                setDeliveryMode("today_slot");
                setDate(days[0].iso);
                const firstAvail = TIME_SLOTS.find(s => s.cutoffHour > beirutHour) ?? null;
                setSlot(firstAvail);
              }}
            />
            <DeliveryTile
              colors={colors}
              icon="calendar"
              title="Choose Another Date"
              subtitle="And Time Slot"
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
                {TIME_SLOTS.map((s) => {
                  const isToday = date === todayIso;
                  const past = isToday && beirutHour >= s.cutoffHour;
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
  const day = days.find((d: any) => d.iso === date);
  return (
    <Card colors={colors} title="Delivery Summary">
      <SummaryRow label="Date" value={day?.full ?? date} colors={colors} />
      <SummaryRow
        label="Time"
        value={
          mode === "express"
            ? "Express Delivery"
            : mode === "today_slot"
              ? "Today · 2:00 PM – 6:00 PM"
              : slot
        }
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
        You will be redirected to a secure checkout to complete payment.
      </Text>
    </View>
  );
}

function PaymentStep({ colors, orderNotes, setOrderNotes, payMethod, setPayMethod, email, setEmail }: any) {
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVC, setCardCVC] = useState("");
  const [cardName, setCardName] = useState("");
  const { currencyCode } = useCurrency();
  const isAED = currencyCode === "AED";
  const isUSD = currencyCode === "USD";

  const fmtCardNumber = (t: string) => {
    const d = t.replace(/\D/g, "").slice(0, 16);
    const parts: string[] = [];
    for (let i = 0; i < d.length; i += 4) parts.push(d.slice(i, i + 4));
    return parts.join(" ");
  };

  const fmtExpiry = (t: string) => {
    const d = t.replace(/\D/g, "").slice(0, 4);
    return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  return (
    <View style={{ gap: 18 }}>
      <Card colors={colors} title="Note For Presentail Team">
        <Field colors={colors} label="Order notes" value={orderNotes} onChangeText={setOrderNotes} placeholder="Any special requests?" multiline />
      </Card>

      <Card colors={colors} title="Ways to Pay">
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: -4 }}>
          All transactions are secure and encrypted.
        </Text>

        {isAED ? (
          <PayOption colors={colors} active={payMethod === "mamo"} onPress={() => setPayMethod("mamo")} title="Mamo — UAE Wallets & Cards" badge="AED" badgeColor="#007C5B">
            {payMethod === "mamo" ? <SecurityNote colors={colors} /> : null}
          </PayOption>
        ) : (
          <>
            <PayOption colors={colors} active={payMethod === "card"} onPress={() => setPayMethod("card")} title="Credit / Debit Card" payIcons="card">
              {payMethod === "card" ? (
                <View style={{ gap: 12 }}>
                  <Field colors={colors} label="Cardholder Name" value={cardName} onChangeText={setCardName} placeholder="Name on card" />
                  <Field
                    colors={colors}
                    label="Card Number"
                    value={cardNumber}
                    onChangeText={(t: string) => setCardNumber(fmtCardNumber(t))}
                    placeholder="1234 5678 9012 3456"
                    keyboardType="number-pad"
                    maxLength={19}
                  />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field
                        colors={colors}
                        label="Expiry (MM/YY)"
                        value={cardExpiry}
                        onChangeText={(t: string) => setCardExpiry(fmtExpiry(t))}
                        placeholder="MM/YY"
                        keyboardType="number-pad"
                        maxLength={5}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        colors={colors}
                        label="CVC"
                        value={cardCVC}
                        onChangeText={(t: string) => setCardCVC(t.replace(/\D/g, "").slice(0, 4))}
                        placeholder="123"
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                      />
                    </View>
                  </View>
                  <Field colors={colors} label="Email for receipt" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
                  <SecurityNote colors={colors} />
                </View>
              ) : null}
            </PayOption>

            <PayOption colors={colors} active={payMethod === "wallet"} onPress={() => setPayMethod("wallet")} title="Apple Pay / Google Pay" payIcons="wallet">
              {payMethod === "wallet" ? (
                <View style={{ gap: 12 }}>
                  <Field colors={colors} label="Email for receipt" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
                  <SecurityNote colors={colors} />
                </View>
              ) : null}
            </PayOption>

            <PayOption colors={colors} active={payMethod === "paypal"} onPress={() => setPayMethod("paypal")} title="PayPal" badge="PP" badgeColor="#003087">
              {payMethod === "paypal" ? <SecurityNote colors={colors} /> : null}
            </PayOption>

            {isUSD ? (
              <>
                <PayOption colors={colors} active={payMethod === "whish"} onPress={() => setPayMethod("whish")} title="Whish Money" badge="whish" badgeColor="#E5302E" />
                <PayOption colors={colors} active={payMethod === "western"} onPress={() => setPayMethod("western")} title="Western Union" badge="WU" badgeColor="#F8B400" />
              </>
            ) : null}
          </>
        )}
      </Card>
    </View>
  );
}

function CardIcons() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ backgroundColor: "#fff", paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "#e5e7eb" }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#006FCF", letterSpacing: 0.4 }}>AMEX</Text>
      </View>
      <View style={{ backgroundColor: "#fff", paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "#e5e7eb", flexDirection: "row" }}>
        <View style={{ width: 11, height: 11, borderRadius: 999, backgroundColor: "#EB001B" }} />
        <View style={{ width: 11, height: 11, borderRadius: 999, backgroundColor: "#F79E1B", marginLeft: -5 }} />
      </View>
      <View style={{ backgroundColor: "#fff", paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "#e5e7eb" }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontStyle: "italic", fontSize: 10, color: "#1A1F71" }}>VISA</Text>
      </View>
    </View>
  );
}

function WalletIcons() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ backgroundColor: "#000", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#fff", letterSpacing: 0.3 }}> Pay</Text>
      </View>
      <View style={{ backgroundColor: "#fff", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "#e5e7eb", flexDirection: "row", alignItems: "center", gap: 2 }}>
        <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: "#4285F4", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 6, color: "#fff" }}>G</Text>
        </View>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#555" }}>Pay</Text>
      </View>
    </View>
  );
}

function PayOption({ colors, active, onPress, title, badge, badgeColor, payIcons, children }: any) {
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
        {payIcons === "card" ? <CardIcons /> : payIcons === "wallet" ? <WalletIcons /> : null}
      </Pressable>
      {children ? <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View> : null}
    </View>
  );
}

// =============== Order Summary ===============

function OrderSummary({ colors, detailed, fees, setQty, remove, coupon, setCoupon, couponOpen, setCouponOpen, showDeliveryFee }: any) {
  const { formatPrice } = useCurrency();
  return (
    <Card colors={colors} title="Order Summary">
      <View style={{ gap: 12 }}>
        {detailed.map(({ product, qty, lineTotal }: any) => (
          <View key={product.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image source={product.image} style={{ width: 48, height: 56, borderRadius: 10, backgroundColor: colors.muted }} contentFit="cover" />
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
                {formatPrice(lineTotal)}
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
          Have a coupon? <Text style={{ textDecorationLine: "underline" }}>Click here to enter your code</Text>
        </Text>
      </Pressable>
      {couponOpen ? (
        <Field colors={colors} value={coupon} onChangeText={setCoupon} placeholder="Coupon code" />
      ) : null}

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
      <SummaryRow label="Subtotal" value={formatPrice(fees.subtotal)} colors={colors} />
      {showDeliveryFee ? (
        <>
          <SummaryRow
            label="Delivery Fee"
            value={fees.districtFee === 0 ? "FREE" : formatPrice(fees.districtFee)}
            colors={colors}
            highlight={fees.districtFee === 0}
          />
          {fees.expressFee > 0 ? (
            <SummaryRow label="Express Delivery" value={formatPrice(fees.expressFee)} colors={colors} />
          ) : null}
        </>
      ) : null}
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
      <SummaryRow label="Total" value={formatPrice(fees.grand)} colors={colors} bold />
    </Card>
  );
}

const styles = StyleSheet.create({
  qtyMini: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
});
