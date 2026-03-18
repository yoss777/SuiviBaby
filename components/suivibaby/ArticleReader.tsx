// components/suivibaby/ArticleReader.tsx
// Full article reader displayed in a bottom sheet

import { getNeutralColors } from "@/constants/dashboardColors";
import type { Tip } from "@/types/content";
import { TIP_CATEGORY_LABELS } from "@/types/content";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback } from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ArticleReaderProps {
  tip: Tip;
  isBookmarked?: boolean;
  feedback?: "up" | "down" | null;
  onBookmark: (tipId: string) => void;
  onFeedback: (tipId: string, feedback: "up" | "down") => void;
  onClose: () => void;
  colorScheme?: "light" | "dark";
}

export const ArticleReader = memo(function ArticleReader({
  tip,
  isBookmarked = false,
  feedback = null,
  onBookmark,
  onFeedback,
  onClose,
  colorScheme = "light",
}: ArticleReaderProps) {
  const nc = getNeutralColors(colorScheme);

  const handleBookmark = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBookmark(tip.id);
  }, [tip.id, onBookmark]);

  const handleThumbUp = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onFeedback(tip.id, "up");
  }, [tip.id, onFeedback]);

  const handleThumbDown = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onFeedback(tip.id, "down");
  }, [tip.id, onFeedback]);

  const handleSourceLink = useCallback(() => {
    if (tip.sourceUrl) {
      Linking.openURL(tip.sourceUrl);
    }
  }, [tip.sourceUrl]);

  const catLabel = TIP_CATEGORY_LABELS[tip.category] ?? tip.category;

  // Simple markdown-like rendering (bold, headers, lists)
  const renderBody = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const trimmed = line.trim();

      // Header (## or ###)
      if (trimmed.startsWith("### ")) {
        return (
          <Text
            key={i}
            style={[styles.bodyH3, { color: nc.textStrong }]}
          >
            {trimmed.slice(4)}
          </Text>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <Text
            key={i}
            style={[styles.bodyH2, { color: nc.textStrong }]}
          >
            {trimmed.slice(3)}
          </Text>
        );
      }

      // Bullet list
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        return (
          <View key={i} style={styles.bulletRow}>
            <Text style={[styles.bullet, { color: tip.accentColor }]}>
              •
            </Text>
            <Text style={[styles.bodyText, { color: nc.textNormal }]}>
              {trimmed.slice(2)}
            </Text>
          </View>
        );
      }

      // Empty line
      if (trimmed === "") {
        return <View key={i} style={styles.spacer} />;
      }

      // Bold markers (**text**)
      const parts = trimmed.split(/\*\*(.*?)\*\*/g);
      if (parts.length > 1) {
        return (
          <Text key={i} style={[styles.bodyText, { color: nc.textNormal }]}>
            {parts.map((part, j) =>
              j % 2 === 1 ? (
                <Text key={j} style={styles.bold}>
                  {part}
                </Text>
              ) : (
                part
              ),
            )}
          </Text>
        );
      }

      // Regular text
      return (
        <Text key={i} style={[styles.bodyText, { color: nc.textNormal }]}>
          {trimmed}
        </Text>
      );
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View
          style={[
            styles.categoryBadge,
            { backgroundColor: tip.accentColor + "15" },
          ]}
        >
          <FontAwesome
            name={tip.icon || "lightbulb"}
            size={12}
            color={tip.accentColor}
          />
          <Text style={[styles.categoryText, { color: tip.accentColor }]}>
            {catLabel}
          </Text>
        </View>
        <Text style={[styles.readTime, { color: nc.textMuted }]}>
          {tip.readTimeMinutes} min de lecture
        </Text>
      </View>

      {/* Title */}
      <Text style={[styles.title, { color: nc.textStrong }]}>
        {tip.title}
      </Text>

      {/* Summary */}
      <Text style={[styles.summary, { color: nc.textLight }]}>
        {tip.summary}
      </Text>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: nc.borderLight }]} />

      {/* Body */}
      <View style={styles.body}>{renderBody(tip.body)}</View>

      {/* Source */}
      {tip.source && (
        <TouchableOpacity
          style={[styles.sourceBox, { backgroundColor: nc.backgroundCard }]}
          onPress={handleSourceLink}
          disabled={!tip.sourceUrl}
          accessibilityRole={tip.sourceUrl ? "link" : "text"}
        >
          <FontAwesome name="book-open" size={12} color={nc.textMuted} />
          <Text style={[styles.sourceText, { color: nc.textMuted }]}>
            Source : {tip.source}
          </Text>
          {tip.sourceUrl && (
            <FontAwesome
              name="arrow-up-right-from-square"
              size={10}
              color={nc.textMuted}
            />
          )}
        </TouchableOpacity>
      )}

      {/* Feedback */}
      <View
        style={[styles.feedbackBox, { backgroundColor: nc.backgroundCard }]}
      >
        <Text style={[styles.feedbackTitle, { color: nc.textStrong }]}>
          Cet article vous a été utile ?
        </Text>
        <View style={styles.feedbackButtons}>
          <TouchableOpacity
            style={[
              styles.feedbackBtn,
              {
                backgroundColor:
                  feedback === "up" ? nc.success + "20" : nc.borderLight + "50",
              },
            ]}
            onPress={handleThumbUp}
            accessibilityRole="button"
            accessibilityLabel="Utile"
            accessibilityState={{ selected: feedback === "up" }}
          >
            <FontAwesome
              name="thumbs-up"
              size={16}
              color={feedback === "up" ? nc.success : nc.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.feedbackBtn,
              {
                backgroundColor:
                  feedback === "down"
                    ? nc.error + "20"
                    : nc.borderLight + "50",
              },
            ]}
            onPress={handleThumbDown}
            accessibilityRole="button"
            accessibilityLabel="Pas utile"
            accessibilityState={{ selected: feedback === "down" }}
          >
            <FontAwesome
              name="thumbs-down"
              size={16}
              color={feedback === "down" ? nc.error : nc.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bookmark */}
      <TouchableOpacity
        style={[
          styles.bookmarkBtn,
          {
            backgroundColor: isBookmarked
              ? tip.accentColor + "15"
              : nc.borderLight + "50",
            borderColor: isBookmarked ? tip.accentColor + "30" : nc.borderLight,
          },
        ]}
        onPress={handleBookmark}
        accessibilityRole="button"
        accessibilityLabel={
          isBookmarked ? "Retirer des favoris" : "Sauvegarder"
        }
      >
        <FontAwesome
          name="bookmark"
          solid={isBookmarked}
          size={14}
          color={isBookmarked ? tip.accentColor : nc.textMuted}
        />
        <Text
          style={[
            styles.bookmarkText,
            { color: isBookmarked ? tip.accentColor : nc.textMuted },
          ]}
        >
          {isBookmarked ? "Sauvegardé" : "Sauvegarder"}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "600",
  },
  readTime: {
    fontSize: 11,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    marginBottom: 8,
  },
  summary: {
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
    marginBottom: 16,
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  body: {
    marginBottom: 20,
  },
  bodyH2: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
    marginTop: 16,
    marginBottom: 8,
  },
  bodyH3: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: 12,
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
  },
  bold: {
    fontWeight: "700",
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    paddingLeft: 4,
    marginBottom: 4,
  },
  bullet: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "700",
  },
  spacer: {
    height: 8,
  },
  sourceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  sourceText: {
    flex: 1,
    fontSize: 12,
  },
  feedbackBox: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  feedbackButtons: {
    flexDirection: "row",
    gap: 16,
  },
  feedbackBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  bookmarkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  bookmarkText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
