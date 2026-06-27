import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BLOG_POSTS } from "@workspace/blog-content";

import { AppText } from "@/components/AppText";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { blogLangFor, formatBlogDate } from "@/lib/blog";

function JournalIndexScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang, isRTL } = useLanguage();
  const headingFontSemiBold = useHeadingFont("600SemiBold");
  const headingFontMedium = useHeadingFont("500Medium");

  const blogLang = blogLangFor(lang);
  const articles = Object.values(BLOG_POSTS)
    .map((byLang) => byLang[blogLang])
    .filter(Boolean)
    .sort((a, b) => b.datePublished.localeCompare(a.datePublished));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 18,
          backgroundColor: colors.primary,
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Feather
            name={isRTL ? "arrow-right" : "arrow-left"}
            size={22}
            color="#fff"
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText
            style={{
              fontFamily: headingFontSemiBold,
              fontSize: 22,
              color: "#fff",
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.journal}
          </AppText>
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: "rgba(255,255,255,0.72)",
              marginTop: 2,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.journalSubtitle}
          </AppText>
        </View>
        <Feather name="book-open" size={22} color="rgba(255,255,255,0.6)" />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingTop: 22,
          paddingBottom: insets.bottom + 40,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        {articles.map((article) => (
          <Pressable
            key={article.slug}
            onPress={() => router.push(`/journal/${article.slug}`)}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 18,
              padding: 20,
              backgroundColor: "#fff",
              gap: 8,
            }}
          >
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 11,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: colors.gold,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {article.eyebrow}
            </AppText>
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 21,
                lineHeight: 28,
                color: colors.primary,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {article.title}
            </AppText>
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                lineHeight: 20,
                color: colors.mutedForeground,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {article.description}
            </AppText>
            <View
              style={{
                marginTop: 6,
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  color: colors.mutedForeground,
                }}
              >
                {formatBlogDate(article.datePublished, lang)}
              </AppText>
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AppText
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 12,
                    color: colors.primary,
                  }}
                >
                  {t.journalReadArticle}
                </AppText>
                <Feather
                  name={isRTL ? "arrow-left" : "arrow-right"}
                  size={14}
                  color={colors.primary}
                />
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default withRouteErrorBoundary(JournalIndexScreen, "journal");
