import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { eventColors } from "@/constants/eventColors";
import { MOOD_OPTIONS } from "@/constants/dashboardConfig";

// ============================================
// TYPES
// ============================================

export interface MoodCardProps {
  currentMood: number | null;
  onSelectMood: (value: 1 | 2 | 3 | 4 | 5) => void;
  isLoading?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const MoodCard = memo(function MoodCard({
  currentMood,
  onSelectMood,
  isLoading = false,
}: MoodCardProps) {
  const getMoodLabel = (value: number): string => {
    switch (value) {
      case 1:
        return "Triste";
      case 2:
        return "Neutre";
      case 3:
        return "Content";
      case 4:
        return "Joyeux";
      case 5:
        return "Très heureux";
      default:
        return "";
    }
  };

  return (
    <View
      style={[styles.statsCard, styles.moodCard]}
      accessibilityRole="radiogroup"
      accessibilityLabel="Humeur du jour"
    >
      <View style={styles.moodHeader}>
        <FontAwesome name="heart" size={18} color={eventColors.jalon.dark} />
        <Text style={styles.moodTitle}>Humeur du jour</Text>
      </View>
      <View style={styles.moodRow}>
        {MOOD_OPTIONS.map((option) => {
          const isActive = currentMood === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.moodEmojiChip, isActive && styles.moodEmojiChipActive]}
              onPress={() => onSelectMood(option.value)}
              activeOpacity={0.7}
              disabled={isLoading}
              accessibilityRole="radio"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={`${getMoodLabel(option.value)}: ${option.emoji}`}
            >
              <Text style={styles.moodEmojiText}>{option.emoji}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  statsCard: {
    flex: 1,
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  moodCard: {
    borderWidth: 1,
    borderColor: `${eventColors.jalon.dark}22`,
  },
  moodHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  moodTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6c757d",
  },
  moodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  moodEmojiChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  moodEmojiChipActive: {
    backgroundColor: `${eventColors.jalon.dark}1A`,
    borderWidth: 1,
    borderColor: `${eventColors.jalon.dark}55`,
  },
  moodEmojiText: {
    fontSize: 16,
  },
});
