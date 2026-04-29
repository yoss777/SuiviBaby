// app/(drawer)/baby/(tabs)/home/styles.ts
//
// StyleSheet for the home tab. Extracted from home.tsx (S3-T1f) — pure
// relocation, no logic change. Imported as `homeStyles` so the rename
// stays explicit on the consumer side.

import { StyleSheet } from "react-native";

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
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginRight: 50,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  inlineMicContainer: {
    paddingTop: 10,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    textTransform: "capitalize",
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitleInline: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  statsGroupContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  // Mood card styles
  moodCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    shadowColor: "#000",
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
    gap: 4,
  },
  moodEmojiButton: {
    flex: 1,
    height: 44,
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  milestonesModalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
});
