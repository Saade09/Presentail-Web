import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/BottomSheet";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE } from "@/lib/stripe";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { useLanguage } from "@/contexts/LanguageContext";
import { OCCASION_OPTIONS, type OccasionValue } from "@/data/occasions";

type Occasion = {
  id: number;
  personName: string | null;
  label: string;
  month: number;
  day: number;
  note: string | null;
  createdAt: string;
};

type FormState = {
  personName: string;
  label: OccasionValue | "";
  month: number | null;
  day: number | null;
  note: string;
};

const EMPTY_FORM: FormState = {
  personName: "",
  label: "",
  month: null,
  day: null,
  note: "",
};

function daysInMonth(month: number): number {
  return new Date(2000, month, 0).getDate();
}

function getMonthName(month: number, lang: string): string {
  const locale = lang === "AR" ? "ar" : lang === "FR" ? "fr" : "en";
  try {
    return new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(2000, month - 1, 1),
    );
  } catch {
    const names = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return names[month - 1] ?? String(month);
  }
}

function OccasionsManagerScreen() {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const { lang, isRTL } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Occasion | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);

  const nameInputRef = useRef<TextInput>(null);

  const authHeaders = useCallback(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
    }),
    [token],
  );

  const loadOccasions = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/me/occasions`, {
        headers: authHeaders(),
      });
      const data = (await res.json()) as { ok: boolean; occasions?: Occasion[] };
      if (data.ok && Array.isArray(data.occasions)) {
        setOccasions(data.occasions);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadOccasions();
  }, [loadOccasions]);

  const openAdd = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (occ: Occasion) => {
    setEditTarget(occ);
    setForm({
      personName: occ.personName ?? "",
      label: OCCASION_OPTIONS.some((o) => o.value === occ.label)
        ? (occ.label as OccasionValue)
        : "",
      month: occ.month,
      day: occ.day,
      note: occ.note ?? "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditTarget(null);
  };

  const getOccasionTypeLabel = (slug: string): string => {
    const map: Record<string, string> = {
      birthday: t.occType_birthday,
      "love-romance": t.occType_love_romance,
      anniversary: t.occType_anniversary,
      wedding: t.occType_wedding,
      "get-well-soon": t.occType_get_well_soon,
      "thank-you": t.occType_thank_you,
      "im-sorry": t.occType_im_sorry,
      newborn: t.occType_newborn,
      congratulations: t.occType_congratulations,
      graduation: t.occType_graduation,
      condolences: t.occType_condolences,
    };
    return map[slug] ?? slug;
  };

  const isFormValid =
    form.personName.trim().length > 0 &&
    form.label.length > 0 &&
    form.month !== null &&
    form.day !== null;

  const handleSave = async () => {
    if (!isFormValid) return;
    setSaving(true);
    try {
      const body = {
        personName: form.personName.trim() || null,
        label: form.label,
        month: form.month,
        day: form.day,
        note: form.note.trim() || null,
      };
      const url = editTarget
        ? `${API_BASE}/api/me/occasions/${editTarget.id}`
        : `${API_BASE}/api/me/occasions`;
      const res = await fetch(url, {
        method: editTarget ? "PUT" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; occasion?: Occasion };
      if (data.ok && data.occasion) {
        if (editTarget) {
          setOccasions((prev) =>
            prev
              .map((o) => (o.id === editTarget.id ? data.occasion! : o))
              .sort((a, b) => a.month - b.month || a.day - b.day),
          );
        } else {
          setOccasions((prev) =>
            [...prev, data.occasion!].sort(
              (a, b) => a.month - b.month || a.day - b.day,
            ),
          );
        }
        closeForm();
      } else {
        Alert.alert(t.accountOccasionsSaveError);
      }
    } catch {
      Alert.alert(t.accountOccasionsSaveError);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (occ: Occasion) => {
    Alert.alert(
      t.accountOccasionsDeleteTitle,
      `"${occ.personName ? `${occ.personName} — ` : ""}${getOccasionTypeLabel(occ.label)}"`,
      [
        { text: t.cancel, style: "cancel" },
        {
          text: t.accountOccasionsDeleteConfirm,
          style: "destructive",
          onPress: () => {
            void handleDelete(occ.id);
          },
        },
      ],
    );
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      const res = await fetch(`${API_BASE}/api/me/occasions/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setOccasions((prev) => prev.filter((o) => o.id !== id));
      } else {
        Alert.alert(t.accountOccasionsDeleteError);
      }
    } catch {
      Alert.alert(t.accountOccasionsDeleteError);
    } finally {
      setDeleting(null);
    }
  };

  const maxDays = form.month !== null ? daysInMonth(form.month) : 31;
  const dayOptions = Array.from({ length: maxDays }, (_, i) => i + 1);

  const renderOccasionCard = (occ: Occasion) => (
    <View
      key={occ.id}
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: `${colors.primary}14`,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Feather name="calendar" size={18} color={colors.primary} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          numberOfLines={1}
          style={{
            fontFamily: "Inter_600SemiBold",
            fontSize: 14,
            color: colors.primary,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {occ.personName
            ? `${occ.personName} — ${getOccasionTypeLabel(occ.label)}`
            : getOccasionTypeLabel(occ.label)}
        </AppText>
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.mutedForeground,
            marginTop: 2,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {getMonthName(occ.month, lang)} {occ.day}
        </AppText>
        {occ.note ? (
          <AppText
            numberOfLines={1}
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: colors.mutedForeground,
              marginTop: 2,
              fontStyle: "italic",
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {occ.note}
          </AppText>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <Pressable
          onPress={() => openEdit(occ)}
          style={({ pressed }) => ({
            padding: 8,
            borderRadius: 8,
            backgroundColor: pressed ? `${colors.primary}10` : "transparent",
          })}
          accessibilityLabel={t.accountOccasionsEdit}
        >
          <Feather name="edit-2" size={16} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          onPress={() => confirmDelete(occ)}
          disabled={deleting === occ.id}
          style={({ pressed }) => ({
            padding: 8,
            borderRadius: 8,
            backgroundColor: pressed ? "#c0392b18" : "transparent",
          })}
          accessibilityLabel={t.accountOccasionsDeleteAction}
        >
          {deleting === occ.id ? (
            <ActivityIndicator size="small" color="#c0392b" />
          ) : (
            <Feather name="trash-2" size={16} color="#c0392b" />
          )}
        </Pressable>
      </View>
    </View>
  );

  const renderPickerSheet = (
    open: boolean,
    onClose: () => void,
    title: string,
    items: { label: string; value: string | number }[],
    selected: string | number | null,
    onSelect: (v: string | number) => void,
  ) => (
    <BottomSheet visible={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, maxHeight: 420 }}>
        <AppText
          style={{
            fontFamily: headingFontMedium,
            fontSize: 18,
            color: colors.primary,
            textAlign: isRTL ? "right" : "left",
            marginBottom: 12,
          }}
        >
          {title}
        </AppText>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
            }}
          >
            {items.map((item, idx) => (
              <React.Fragment key={String(item.value)}>
                {idx > 0 && (
                  <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 14 }} />
                )}
                <Pressable
                  onPress={() => {
                    onSelect(item.value);
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    backgroundColor: pressed ? "#0001" : "#fff",
                  })}
                >
                  <AppText
                    style={{
                      flex: 1,
                      fontFamily:
                        selected === item.value
                          ? "Inter_600SemiBold"
                          : "Inter_400Regular",
                      fontSize: 15,
                      color: colors.primary,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {item.label}
                  </AppText>
                  {selected === item.value && (
                    <Feather name="check" size={18} color={colors.primary} />
                  )}
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        </ScrollView>
      </View>
    </BottomSheet>
  );

  const renderFormSheet = () => {
    const selectedTypeName = form.label ? getOccasionTypeLabel(form.label) : "";
    const selectedMonthName = form.month ? getMonthName(form.month, lang) : "";
    const selectedDayName = form.day ? String(form.day) : "";

    return (
      <BottomSheet visible={formOpen} onClose={closeForm}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 520 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}
        >
          <AppText
            style={{
              fontFamily: headingFontMedium,
              fontSize: 20,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
              marginBottom: 20,
            }}
          >
            {editTarget
              ? t.accountOccasionsEditTitle
              : t.accountOccasionsAddTitle}
          </AppText>

          {/* Person's name */}
          <FieldLabel label={t.accountOccasionsPersonLabel} isRTL={isRTL} colors={colors} required />
          <TextInput
            ref={nameInputRef}
            value={form.personName}
            onChangeText={(v) => setForm((f) => ({ ...f, personName: v }))}
            placeholder={t.accountOccasionsPersonPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 13,
              paddingHorizontal: 14,
              fontFamily: "Inter_400Regular",
              fontSize: 15,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
              marginBottom: 16,
            }}
          />

          {/* Occasion type */}
          <FieldLabel label={t.accountOccasionsTypeLabel} isRTL={isRTL} colors={colors} required />
          <Pressable
            onPress={() => setTypePickerOpen(true)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#f9f9f9" : "#fff",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 13,
              paddingHorizontal: 14,
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              marginBottom: 16,
            })}
          >
            <AppText
              style={{
                flex: 1,
                fontFamily: "Inter_400Regular",
                fontSize: 15,
                color: form.label ? colors.primary : colors.mutedForeground,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {form.label
                ? selectedTypeName
                : t.accountOccasionsTypePlaceholder}
            </AppText>
            <Feather
              name={isRTL ? "chevron-left" : "chevron-right"}
              size={16}
              color={colors.mutedForeground}
            />
          </Pressable>

          {/* Month & Day row */}
          <View
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <View style={{ flex: 1 }}>
              <FieldLabel label={t.accountOccasionsMonthLabel} isRTL={isRTL} colors={colors} required />
              <Pressable
                onPress={() => setMonthPickerOpen(true)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "#f9f9f9" : "#fff",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: 13,
                  paddingHorizontal: 14,
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                })}
              >
                <AppText
                  style={{
                    flex: 1,
                    fontFamily: "Inter_400Regular",
                    fontSize: 14,
                    color: form.month !== null ? colors.primary : colors.mutedForeground,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {form.month !== null
                    ? selectedMonthName
                    : t.accountOccasionsMonthPlaceholder}
                </AppText>
                <Feather
                  name="chevron-down"
                  size={14}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>

            <View style={{ flex: 1 }}>
              <FieldLabel label={t.accountOccasionsDayLabel} isRTL={isRTL} colors={colors} required />
              <Pressable
                onPress={() => form.month !== null && setDayPickerOpen(true)}
                style={({ pressed }) => ({
                  backgroundColor:
                    form.month === null
                      ? colors.muted
                      : pressed
                      ? "#f9f9f9"
                      : "#fff",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: 13,
                  paddingHorizontal: 14,
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  opacity: form.month === null ? 0.5 : 1,
                })}
              >
                <AppText
                  style={{
                    flex: 1,
                    fontFamily: "Inter_400Regular",
                    fontSize: 14,
                    color: form.day !== null ? colors.primary : colors.mutedForeground,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {form.day !== null
                    ? selectedDayName
                    : t.accountOccasionsDayPlaceholder}
                </AppText>
                <Feather
                  name="chevron-down"
                  size={14}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>
          </View>

          {/* Note */}
          <FieldLabel label={t.accountOccasionsNoteLabel} isRTL={isRTL} colors={colors} />
          <TextInput
            value={form.note}
            onChangeText={(v) => setForm((f) => ({ ...f, note: v }))}
            placeholder={t.accountOccasionsNotePlaceholder}
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 13,
              paddingHorizontal: 14,
              fontFamily: "Inter_400Regular",
              fontSize: 15,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
              marginBottom: 20,
            }}
          />

          {/* Save button */}
          <Pressable
            onPress={() => {
              void handleSave();
            }}
            disabled={saving || !isFormValid}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 999,
              paddingVertical: 15,
              alignItems: "center",
              opacity: saving || !isFormValid ? 0.45 : pressed ? 0.88 : 1,
            })}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <AppText
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 15,
                  color: "#fff",
                  letterSpacing: 0.4,
                }}
              >
                {t.accountOccasionsSave}
              </AppText>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: t.accountOccasions,
          headerRight: () => (
            <Pressable
              onPress={openAdd}
              style={{ paddingHorizontal: 4 }}
              accessibilityLabel={t.accountOccasionsAdd}
            >
              <Feather name="plus" size={24} color={colors.primary} />
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : loadError ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            gap: 12,
          }}
        >
          <Feather name="alert-circle" size={36} color={colors.mutedForeground} />
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 15,
              color: colors.mutedForeground,
              textAlign: "center",
            }}
          >
            {t.accountOccasionsLoadError}
          </AppText>
          <Pressable
            onPress={() => {
              void loadOccasions();
            }}
            style={({ pressed }) => ({
              marginTop: 4,
              paddingVertical: 10,
              paddingHorizontal: 24,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.primary,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 14,
                color: colors.primary,
              }}
            >
              {t.savedAddressesRetry}
            </AppText>
          </Pressable>
        </View>
      ) : occasions.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            gap: 12,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: `${colors.primary}14`,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 4,
            }}
          >
            <Feather name="calendar" size={28} color={colors.primary} />
          </View>
          <AppText
            style={{
              fontFamily: "Inter_600SemiBold",
              fontSize: 17,
              color: colors.primary,
              textAlign: "center",
            }}
          >
            {t.accountOccasionsEmpty}
          </AppText>
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              color: colors.mutedForeground,
              textAlign: "center",
              lineHeight: 21,
            }}
          >
            {t.accountOccasionsEmptyDesc}
          </AppText>
          <Pressable
            onPress={openAdd}
            style={({ pressed }) => ({
              marginTop: 8,
              backgroundColor: colors.primary,
              borderRadius: 999,
              paddingVertical: 13,
              paddingHorizontal: 28,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                color: "#fff",
                letterSpacing: 0.4,
              }}
            >
              {t.accountOccasionsAdd}
            </AppText>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 20,
            gap: 10,
            paddingBottom: insets.bottom + 100,
          }}
        >
          {occasions.map(renderOccasionCard)}

          <Pressable
            onPress={openAdd}
            style={({ pressed }) => ({
              marginTop: 4,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: colors.primary,
              borderStyle: "dashed",
              paddingVertical: 16,
              alignItems: "center",
              flexDirection: isRTL ? "row-reverse" : "row",
              justifyContent: "center",
              gap: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="plus" size={16} color={colors.primary} />
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 14,
                color: colors.primary,
              }}
            >
              {t.accountOccasionsAdd}
            </AppText>
          </Pressable>
        </ScrollView>
      )}

      {renderFormSheet()}

      {renderPickerSheet(
        typePickerOpen,
        () => setTypePickerOpen(false),
        t.accountOccasionsTypeLabel,
        OCCASION_OPTIONS.filter((o) => o.value === "birthday" || o.value === "anniversary").map((o) => ({
          label: getOccasionTypeLabel(o.value),
          value: o.value,
        })),
        form.label,
        (v) => setForm((f) => ({ ...f, label: v as OccasionValue })),
      )}

      {renderPickerSheet(
        monthPickerOpen,
        () => setMonthPickerOpen(false),
        t.accountOccasionsMonthLabel,
        Array.from({ length: 12 }, (_, i) => ({
          label: getMonthName(i + 1, lang),
          value: i + 1,
        })),
        form.month,
        (v) => {
          const m = v as number;
          setForm((f) => ({
            ...f,
            month: m,
            day: f.day !== null && f.day > daysInMonth(m) ? null : f.day,
          }));
        },
      )}

      {renderPickerSheet(
        dayPickerOpen,
        () => setDayPickerOpen(false),
        t.accountOccasionsDayLabel,
        dayOptions.map((d) => ({ label: String(d), value: d })),
        form.day,
        (v) => setForm((f) => ({ ...f, day: v as number })),
      )}
    </View>
  );
}

function FieldLabel({
  label,
  isRTL,
  colors,
  required,
}: {
  label: string;
  isRTL: boolean;
  colors: ReturnType<typeof useColors>;
  required?: boolean;
}) {
  return (
    <AppText
      style={{
        fontFamily: "Inter_500Medium",
        fontSize: 11,
        letterSpacing: 1.1,
        textTransform: "uppercase",
        color: colors.mutedForeground,
        textAlign: isRTL ? "right" : "left",
        marginBottom: 6,
      }}
    >
      {label}
      {required ? " *" : ""}
    </AppText>
  );
}

export default withRouteErrorBoundary(OccasionsManagerScreen, "occasions-manager");
