// components/suivibaby/home/styles.ts
//
// StyleSheet for the home tab. Extracted from home.tsx (S3-T1f) — pure
// relocation, no logic change. Imported as `homeStyles` so the rename
// stays explicit on the consumer side.

import { radius, space } from "@/constants/tokens";
import { StyleSheet } from "react-native";
import { neutralColors } from "@/constants/dashboardColors";

export const homeStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  headerRow: {
    marginBottom: space.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginRight: 50,
  },
  header: {
    padding: space.lg,
    paddingBottom: 10,
  },
  // Salutation réduite (28 → 22) : le résumé du jour reste le premier repère.
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: space.xxs,
  },
  date: {
    fontSize: 16,
    textTransform: "capitalize",
  },
  section: {
    marginBottom: space.xs,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginHorizontal: space.lg,
    marginBottom: space.md,
  },
  sectionTitleInline: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  statsGroupContainer: {
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  // Mood card styles
  moodCard: {
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    shadowColor: neutralColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  moodLabel: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  moodEmojisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.xxs,
  },
  moodEmojiButton: {
    flex: 1,
    // minHeight et non height : l'emoji n'est pas coupé en grande taille de texte.
    minHeight: 44,
    paddingVertical: space.xxs,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  moodEmojiSelected: {
    borderWidth: 2,
  },
  moodEmojiText: {
    fontSize: 22,
  },
  milestonesModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  milestonesModalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
});
