import { getNeutralColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInLeft,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";

type MoodLevel = 1 | 2 | 3 | 4 | 5;

type MoodEntry = {
  id: string;
  date: Date;
  humeur: MoodLevel;
};

type VerticalMoodTimelineProps = {
  moods: MoodEntry[];
  colorScheme?: "light" | "dark";
};

const PAGE_SIZE = 3;
const ITEM_HEIGHT = 60;
const MAX_VISIBLE_HEIGHT = PAGE_SIZE * ITEM_HEIGHT + 20;

const MOOD_CONFIG: Record<
  MoodLevel,
  { emoji: string; label: string; color: string }
> = {
  1: { emoji: "😢", label: "Difficile", color: "#ef4444" },
  2: { emoji: "😐", label: "Mitigé", color: "#f59e0b" },
  3: { emoji: "🙂", label: "OK", color: "#3b82f6" },
  4: { emoji: "😄", label: "Content", color: "#22c55e" },
  5: { emoji: "🥰", label: "Rayonnant", color: "#ec4899" },
};

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const isToday = (date: Date) => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

// Timeline item with animation
const TimelineItem = ({
  mood,
  index,
  isLast,
  nc,
}: {
  mood: MoodEntry;
  index: number;
  isLast: boolean;
  nc: ReturnType<typeof getNeutralColors>;
}) => {
  const config = MOOD_CONFIG[mood.humeur];
  const dotScale = useSharedValue(0);

  useEffect(() => {
    dotScale.value = withDelay(
      Math.min(index, 4) * 80,
      withSpring(1, { damping: 12 }),
    );
  }, []);

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInLeft.delay(Math.min(index, 4) * 60).springify()}
      style={styles.timelineItem}
      accessibilityLabel={`${formatTime(mood.date)}: ${config.label}`}
    >
      {/* Time label */}
      <View style={styles.timeColumn}>
        <Text style={[styles.timeText, { color: nc.textMuted }]}>
          {formatTime(mood.date)}
        </Text>
      </View>

      {/* Dot and line */}
      <View style={styles.dotColumn}>
        <Animated.View
          style={[
            styles.dot,
            { backgroundColor: config.color },
            dotAnimatedStyle,
          ]}
        >
          <Text style={styles.dotEmoji}>{config.emoji}</Text>
        </Animated.View>
        {!isLast && (
          <View
            style={[styles.line, { backgroundColor: `${config.color}30` }]}
          />
        )}
      </View>

      {/* Content bubble */}
      <View
        style={[
          styles.bubble,
          { backgroundColor: nc.background, borderLeftColor: config.color },
        ]}
      >
        <Text style={[styles.bubbleLabel, { color: nc.textNormal }]}>
          {config.label}
        </Text>
      </View>
    </Animated.View>
  );
};

export const VerticalMoodTimeline = ({
  moods,
  colorScheme = "light",
}: VerticalMoodTimelineProps) => {
  const nc = getNeutralColors(colorScheme);
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter and sort today's moods
  const todayMoods = useMemo(() => {
    return moods
      .filter((m) => isToday(m.date))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [moods]);

  // Compute visible moods - 5 when collapsed, all when expanded
  const visibleMoods = isExpanded ? todayMoods : todayMoods.slice(0, PAGE_SIZE);
  const hasMoreToShow = todayMoods.length > PAGE_SIZE;

  // Toggle expand/collapse
  const handleToggleExpand = useCallback(() => {
    if (!isExpanded) {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [isExpanded]);

  if (todayMoods.length === 0) {
    return null; // No empty state needed - HeroMoodCard handles this
  }

  return (
    <View style={[styles.container, { backgroundColor: nc.backgroundCard }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, { color: nc.textStrong }]}>
            Fil du jour
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{todayMoods.length}</Text>
          </View>
        </View>
      </View>

      {/* Scrollable list when expanded */}
      {isExpanded ? (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
        >
          {visibleMoods.map((mood, index) => (
            <TimelineItem
              key={mood.id}
              mood={mood}
              index={index}
              isLast={index === visibleMoods.length - 1}
              nc={nc}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.listContent}>
          {visibleMoods.map((mood, index) => (
            <TimelineItem
              key={mood.id}
              mood={mood}
              index={index}
              isLast={index === visibleMoods.length - 1 && !hasMoreToShow}
              nc={nc}
            />
          ))}
        </View>
      )}

      {/* Toggle button */}
      {hasMoreToShow && (
        <Pressable
          style={({ pressed }) => [
            styles.toggleButton,
            { borderTopColor: nc.borderLight },
            pressed && styles.toggleButtonPressed,
          ]}
          onPress={handleToggleExpand}
          accessibilityRole="button"
          accessibilityLabel={
            isExpanded
              ? "Réduire la liste"
              : "Voir toutes les humeurs"
          }
        >
          <Text style={[styles.toggleButtonText, { color: nc.textLight }]}>
            {isExpanded
              ? "Réduire"
              : `Voir tout (${todayMoods.length - PAGE_SIZE} de plus)`}
          </Text>
          <FontAwesome6
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={12}
            color={nc.textLight}
          />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  countBadge: {
    backgroundColor: eventColors.jalon.light,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 12,
    fontWeight: "600",
    color: eventColors.jalon.dark,
  },
  addSmallButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: eventColors.jalon.light,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContainer: {
    maxHeight: MAX_VISIBLE_HEIGHT,
  },
  listContent: {
    paddingLeft: 8,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: ITEM_HEIGHT,
  },
  timeColumn: {
    width: 50,
    paddingTop: 8,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "500",
  },
  dotColumn: {
    width: 50,
    alignItems: "center",
  },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  dotEmoji: {
    fontSize: 20,
  },
  line: {
    width: 3,
    flex: 1,
    minHeight: 20,
    borderRadius: 2,
    marginVertical: 4,
  },
  bubble: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginLeft: 12,
    borderLeftWidth: 3,
  },
  bubbleLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: eventColors.jalon.dark,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 50,
  },
  addButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginTop: 8,
    borderTopWidth: 1,
  },
  toggleButtonPressed: {
    opacity: 0.7,
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
