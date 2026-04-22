import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCart } from "@/contexts/CartContext";
import { useColors } from "@/hooks/useColors";

type Step = 0 | 1 | 2 | 3;
const STEPS = ["Recipient", "Delivery", "Message", "Payment"] as const;

const LEBANON_CITIES = [
  "Beirut",
  "Jounieh",
  "Jbeil",
  "Tripoli",
  "Sidon",
  "Tyre",
  "Zahle",
  "Baalbek",
  "Batroun",
  "Aley",
];

function dayLabels() {
  const out: { iso: string; label: string; day: string; date: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 10; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short" }),
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      date: String(d.getDate()),
    });
  }
  return out;
}

const TIME_SLOTS = ["10am – 1pm", "1pm – 4pm", "4pm – 7pm", "7pm – 9pm"];

export default function CheckoutScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { detailed, total, clear } = useCart();

  const [step, setStep] = useState<Step>(0);

  // Form state
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");

  const days = useMemo(dayLabels, []);
  const [city, setCity] = useState(LEBANON_CITIES[0]);
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(days[0].iso);
  const [slot, setSlot] = useState(TIME_SLOTS[1]);

  const [message, setMessage] = useState("");
  const [signedBy, setSignedBy] = useState("");

  const [payMethod, setPayMethod] = useState<"card" | "cash" | "whish">("card");

  const fees = useMemo(() => {
    const subtotal = total;
    const delivery = 0;
    const wrap = subtotal > 0 ? 5 : 0;
    return { subtotal, delivery, wrap, grand: subtotal + delivery + wrap };
  }, [total]);

  const stepValid = (s: Step) => {
    if (s === 0) return senderName.trim() && senderPhone.trim() && recipientName.trim() && recipientPhone.trim();
    if (s === 1) return city && address.trim() && date && slot;
    if (s === 2) return true;
    if (s === 3) return !!payMethod;
    return false;
  };

  const next = () => {
    if (!stepValid(step)) return;
    if (step < 3) setStep(((step + 1) as Step));
    else placeOrder();
  };

  const placeOrder = () => {
    const orderId = `PR-${Math.floor(100000 + Math.random() * 899999)}`;
    const total = fees.grand;
    clear();
    router.replace(`/order-confirmed?orderId=${orderId}&total=${total}&date=${date}&slot=${encodeURIComponent(slot)}&recipient=${encodeURIComponent(recipientName)}` as any);
  };

  if (detailed.length === 0 && step < 3) {
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
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable onPress={() => (step === 0 ? router.back() : setStep(((step - 1) as Step)))} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.primary} />
        </Pressable>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 18, color: colors.primary }}>
          Checkout
        </Text>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground }}>
          {step + 1}/4
        </Text>
      </View>

      {/* Stepper */}
      <View style={{ flexDirection: "row", paddingHorizontal: 24, gap: 6, marginTop: 6, marginBottom: 6 }}>
        {STEPS.map((label, i) => (
          <View key={label} style={{ flex: 1 }}>
            <View
              style={{
                height: 3,
                borderRadius: 2,
                backgroundColor: i <= step ? colors.gold : colors.border,
              }}
            />
            <Text
              style={{
                marginTop: 6,
                fontFamily: "Inter_500Medium",
                fontSize: 10,
                color: i === step ? colors.primary : colors.mutedForeground,
                letterSpacing: 1,
                textTransform: "uppercase",
                textAlign: "center",
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: 220, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <RecipientStep
            colors={colors}
            sender={{ name: senderName, phone: senderPhone, set: { name: setSenderName, phone: setSenderPhone } }}
            recipient={{ name: recipientName, phone: recipientPhone, set: { name: setRecipientName, phone: setRecipientPhone } }}
          />
        )}
        {step === 1 && (
          <DeliveryStep
            colors={colors}
            cities={LEBANON_CITIES}
            city={city}
            setCity={setCity}
            address={address}
            setAddress={setAddress}
            days={days}
            date={date}
            setDate={setDate}
            slots={TIME_SLOTS}
            slot={slot}
            setSlot={setSlot}
          />
        )}
        {step === 2 && (
          <MessageStep
            colors={colors}
            message={message}
            setMessage={setMessage}
            signedBy={signedBy}
            setSignedBy={setSignedBy}
          />
        )}
        {step === 3 && (
          <PaymentStep
            colors={colors}
            method={payMethod}
            setMethod={setPayMethod}
            fees={fees}
            recipient={recipientName}
            address={`${address}, ${city}`}
            date={date}
            slot={slot}
            items={detailed}
          />
        )}
      </ScrollView>

      {/* Footer */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 24,
          paddingTop: 14,
          paddingBottom: insets.bottom + 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <View>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1, textTransform: "uppercase" }}>
            Total
          </Text>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: colors.primary }}>
            ${fees.grand.toLocaleString()}
          </Text>
        </View>
        <Pressable
          disabled={!stepValid(step)}
          onPress={next}
          style={({ pressed }) => [
            {
              flex: 1,
              maxWidth: 240,
              backgroundColor: stepValid(step) ? colors.primary : colors.border,
              paddingVertical: 16,
              borderRadius: 999,
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
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontSize: 12,
            }}
          >
            {step === 3 ? "Place Order" : "Continue"}
          </Text>
          <Feather name={step === 3 ? "lock" : "arrow-right"} size={14} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ colors, label, value, onChangeText, placeholder, keyboardType, multiline }: any) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.4, textTransform: "uppercase" }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        multiline={multiline}
        style={{
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 14,
          minHeight: multiline ? 110 : undefined,
          fontFamily: "Inter_400Regular",
          fontSize: 14,
          color: colors.primary,
          textAlignVertical: multiline ? "top" : "auto",
          ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
        }}
      />
    </View>
  );
}

function RecipientStep({ colors, sender, recipient }: any) {
  return (
    <View style={{ gap: 22 }}>
      <View>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: colors.primary }}>
          Who is sending this gift?
        </Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, marginTop: 4 }}>
          We'll keep you posted at every step of the delivery.
        </Text>
      </View>
      <Field colors={colors} label="Your name" value={sender.name} onChangeText={sender.set.name} placeholder="Lara Khoury" />
      <Field colors={colors} label="Your phone" value={sender.phone} onChangeText={sender.set.phone} placeholder="+961 70 000 000" keyboardType="phone-pad" />

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />

      <View>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 18, color: colors.primary }}>
          Who is receiving it?
        </Text>
      </View>
      <Field colors={colors} label="Recipient name" value={recipient.name} onChangeText={recipient.set.name} placeholder="Maya R." />
      <Field colors={colors} label="Recipient phone" value={recipient.phone} onChangeText={recipient.set.phone} placeholder="+961 71 000 000" keyboardType="phone-pad" />
    </View>
  );
}

function DeliveryStep({ colors, cities, city, setCity, address, setAddress, days, date, setDate, slots, slot, setSlot }: any) {
  return (
    <View style={{ gap: 22 }}>
      <View>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: colors.primary }}>
          Where & when?
        </Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, marginTop: 4 }}>
          Same-day delivery across Lebanon — choose your window.
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.4, textTransform: "uppercase" }}>
          City
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {cities.map((c: string) => {
            const active = c === city;
            return (
              <Pressable
                key={c}
                onPress={() => setCity(c)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : "#fff",
                }}
              >
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: active ? "#fff" : colors.primary }}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Field colors={colors} label="Street address" value={address} onChangeText={setAddress} placeholder="Building, floor, street, area" multiline />

      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.4, textTransform: "uppercase" }}>
          Delivery date
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {days.map((d: any) => {
            const active = d.iso === date;
            return (
              <Pressable
                key={d.iso}
                onPress={() => setDate(d.iso)}
                style={{
                  width: 64,
                  paddingVertical: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : "#fff",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: active ? colors.goldSoft : colors.mutedForeground, letterSpacing: 1, textTransform: "uppercase" }}>
                  {d.label}
                </Text>
                <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 18, color: active ? "#fff" : colors.primary }}>
                  {d.date}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.4, textTransform: "uppercase" }}>
          Time window
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {slots.map((s: string) => {
            const active = s === slot;
            return (
              <Pressable
                key={s}
                onPress={() => setSlot(s)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : "#fff",
                }}
              >
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: active ? "#fff" : colors.primary }}>
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function MessageStep({ colors, message, setMessage, signedBy, setSignedBy }: any) {
  const presets = [
    "Thinking of you today.",
    "With all my love.",
    "Congratulations on the new chapter!",
    "Wishing you a magical birthday.",
  ];
  return (
    <View style={{ gap: 22 }}>
      <View>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: colors.primary }}>
          Add a personal note
        </Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, marginTop: 4 }}>
          Hand-written by our atelier on a Presentail card.
        </Text>
      </View>
      <Field colors={colors} label="Message" value={message} onChangeText={setMessage} placeholder="Write a few words…" multiline />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {presets.map((p) => (
          <Pressable
            key={p}
            onPress={() => setMessage(p)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: "#fff",
            }}
          >
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.primary }}>
              {p}
            </Text>
          </Pressable>
        ))}
      </View>

      <Field colors={colors} label="Signed by" value={signedBy} onChangeText={setSignedBy} placeholder="Lara" />

      <View
        style={{
          borderRadius: 18,
          padding: 20,
          backgroundColor: colors.secondary,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 8,
        }}
      >
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 2, color: colors.gold, textTransform: "uppercase" }}>
          Card preview
        </Text>
        <Text style={{ fontFamily: "PlayfairDisplay_400Regular", fontSize: 18, color: colors.primary, lineHeight: 26 }}>
          {message?.trim() || "Your message will appear here…"}
        </Text>
        {signedBy ? (
          <Text style={{ fontFamily: "PlayfairDisplay_400Regular", fontSize: 14, color: colors.primary, marginTop: 6 }}>
            — {signedBy}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PaymentStep({ colors, method, setMethod, fees, recipient, address, date, slot, items }: any) {
  const methods: { id: "card" | "cash" | "whish"; label: string; sub: string; icon: any }[] = [
    { id: "card", label: "Credit / Debit Card", sub: "Visa, Mastercard, Amex", icon: "credit-card-outline" },
    { id: "whish", label: "Whish Money", sub: "Pay with your Whish account", icon: "cellphone" },
    { id: "cash", label: "Cash on Delivery", sub: "Pay the courier in USD or LBP", icon: "cash" },
  ];
  return (
    <View style={{ gap: 22 }}>
      <View>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: colors.primary }}>
          Payment & review
        </Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, marginTop: 4 }}>
          Choose how you'd like to pay.
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        {methods.map((m) => {
          const active = m.id === method;
          return (
            <Pressable
              key={m.id}
              onPress={() => setMethod(m.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                padding: 16,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.secondary : "#fff",
              }}
            >
              <MaterialCommunityIcons name={m.icon} size={22} color={active ? colors.primary : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary }}>{m.label}</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{m.sub}</Text>
              </View>
              <Feather name={active ? "check-circle" : "circle"} size={20} color={active ? colors.gold : colors.border} />
            </Pressable>
          );
        })}
      </View>

      <View style={{ borderRadius: 18, backgroundColor: "#fff", padding: 18, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 2, color: colors.gold, textTransform: "uppercase" }}>
          Order summary
        </Text>
        <View style={{ gap: 10 }}>
          {items.map(({ product, qty, lineTotal }: any) => (
            <View key={product.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Image source={product.image} style={{ width: 48, height: 56, borderRadius: 10, backgroundColor: colors.muted }} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
                  {product.name}
                </Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
                  Qty {qty}
                </Text>
              </View>
              <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 14, color: colors.primary }}>
                ${lineTotal.toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
        <Row label="Subtotal" value={`$${fees.subtotal.toLocaleString()}`} colors={colors} />
        <Row label="Boutique wrapping" value={`$${fees.wrap}`} colors={colors} />
        <Row label="Delivery" value="Free" colors={colors} accent />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 16, color: colors.primary }}>Total</Text>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 18, color: colors.primary }}>
            ${fees.grand.toLocaleString()}
          </Text>
        </View>
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: colors.mutedForeground }}>
            Delivering to
          </Text>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
            {recipient || "Recipient"}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
            {address}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
            {date} · {slot}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Row({ label, value, colors, accent }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: accent ? colors.gold : colors.primary }}>{value}</Text>
    </View>
  );
}
