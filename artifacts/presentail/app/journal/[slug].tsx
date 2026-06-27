import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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

function JournalArticleScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang, isRTL } = useLanguage();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const headingFontSemiBold = useHeadingFont("600SemiBold");
  const headingFontMedium = useHeadingFont("500Medium");

  const blogLang = blogLangFor(lang);
  const article = typeof slug === "string" ? BLOG_POSTS[slug]?.[blogLang] : undefined;

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
            numberOfLines={1}
            style={{
              fontFamily: headingFontSemiBold,
              fontSize: 18,
              color: "#fff",
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {article ? article.title : t.journal}
          </AppText>
        </View>
      </View>

      {article ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 26,
            paddingBottom: insets.bottom + 48,
          }}
          showsVerticalScrollIndicator={false}
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
              marginTop: 8,
              fontFamily: headingFontMedium,
              fontSize: 30,
              lineHeight: 40,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {article.title}
          </AppText>
          <AppText
            style={{
              marginTop: 10,
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: colors.mutedForeground,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {formatBlogDate(article.datePublished, lang)}
          </AppText>

          <View style={{ marginTop: 24, gap: 22 }}>
            {article.sections.map((section, i) => (
              <View key={i} style={{ gap: 8 }}>
                {section.heading ? (
                  <AppText
                    style={{
                      fontFamily: headingFontSemiBold,
                      fontSize: 18,
                      lineHeight: 26,
                      color: colors.primary,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {section.heading}
                  </AppText>
                ) : null}
                <AppText
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 15,
                    lineHeight: 25,
                    color: colors.foreground,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {section.body}
                </AppText>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            gap: 14,
          }}
        >
          <Feather name="book" size={32} color={colors.mutedForeground} />
          <AppText
            style={{
              fontFamily: headingFontMedium,
              fontSize: 18,
              color: colors.primary,
              textAlign: "center",
            }}
          >
            {t.journalNotFound}
          </AppText>
          <Pressable
            onPress={() => router.replace("/journal")}
            style={{
              marginTop: 4,
              paddingHorizontal: 24,
              paddingVertical: 11,
              borderRadius: 999,
              backgroundColor: colors.primary,
            }}
          >
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: "#fff",
              }}
            >
              {t.journal}
            </AppText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default withRouteErrorBoundary(JournalArticleScreen, "journal-article");
