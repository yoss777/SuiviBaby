import { getMoodFills, getNeutralColors } from "@/constants/dashboardColors";
import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
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

type WeekMoodOverviewProps = {
  moods: MoodEntry[];
  colorScheme?: "light" | "dark";
};

const MOOD_EMOJIS: Record<MoodLevel, string> = {
  1: "😢",
  2: "😐",
  3: "🙂",
  4: "😄",
  5: "🥰",
};

const MOOD_LABELS: Record<MoodLevel, string> = {
  1: "Difficile",
  2: "Mitigé",
  3: "OK",
  4: "Content",
  5: "Rayonnant",
};

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const isSameDay = (date1: Date, date2: Date) =>
  date1.getDate() === date2.getDate() &&
  date1.getMonth() === date2.getMonth() &&
  date1.getFullYear() === date2.getFullYear();

// Single day circle
const DayCircle = ({
  day,
  dayIndex,
  dominantMood,
  isToday,
  isFuture,
  index,
  nc,
  moodColors,
}: {
  day: Date;
  dayIndex: number;
  dominantMood: MoodLevel | null;
  isToday: boolean;
  isFuture: boolean;
  index: number;
  nc: ReturnType<typeof getNeutralColors>;
  moodColors: Record<MoodLevel, string>;
}) => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(index * 60, withSpring(1));
    scale.value = withDelay(index * 60, withSpring(1, { damping: 12 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const bgColor = dominantMood
    ? moodColors[dominantMood]
    : isFuture
    ? "transparent"
    : nc.backgroundPressed;

  const moodLabel = dominantMood
    ? MOOD_LABELS[dominantMood]
    : isFuture
    ? "pas encore de données"
    : "pas de données";

  return (
    <View
      style={styles.dayColumn}
      accessibilityLabel={`${DAY_NAMES[dayIndex]} ${day.getDate()}: ${moodLabel}`}
    >
      <Text
        style={[
          styles.dayName,
          { color: nc.textMuted },
          isToday && { color: nc.todayAccent, fontWeight: "700" },
        ]}
      >
        {DAY_NAMES[dayIndex]}
      </Text>
      <Animated.View
        style={[
          styles.dayCircle,
          {
            backgroundColor: bgColor,
            borderWidth: isFuture ? 2 : isToday ? 3 : 0,
            borderColor: isFuture
              ? nc.border
              : isToday
              ? nc.todayAccent
              : "transparent",
            borderStyle: isFuture ? "dashed" : "solid",
          },
          isToday && {
            shadowColor: nc.todayAccent,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 3,
          },
          animatedStyle,
        ]}
      >
        <Text style={[styles.dayEmoji, isFuture && styles.dayEmojiMuted]}>
          {dominantMood ? MOOD_EMOJIS[dominantMood] : isFuture ? "?" : "—"}
        </Text>
      </Animated.View>
      <Text
        style={[
          styles.dayDate,
          { color: nc.textMuted },
          isToday && { color: nc.todayAccent, fontWeight: "600" },
        ]}
      >
        {day.getDate()}
      </Text>
    </View>
  );
};

export const WeekMoodOverview = ({
  moods,
  colorScheme = "light",
}: WeekMoodOverviewProps) => {
  const nc = getNeutralColors(colorScheme);
  const moodColors = getMoodFills(colorScheme);

  // Refresh weekDays when date changes (e.g. after midnight)
  const todayKey = new Date().toDateString();

  // Get current week (Monday to Sunday)
  const weekDays = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + mondayOffset + i);
      date.setHours(0, 0, 0, 0);
      days.push(date);
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);

  // Calculate dominant mood for each day
  const weekMoods = useMemo(() => {
    return weekDays.map((day) => {
      const dayMoods = moods.filter((m) => isSameDay(m.date, day));
      if (dayMoods.length === 0) return null;

      // Get most frequent mood or average rounded, clamped to valid range
      const sum = dayMoods.reduce((acc, m) => acc + m.humeur, 0);
      return Math.max(1, Math.min(5, Math.round(sum / dayMoods.length))) as MoodLevel;
    });
  }, [weekDays, moods]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate week stats
  const weekStats = useMemo(() => {
    const validMoods = weekMoods.filter((m) => m !== null) as MoodLevel[];
    if (validMoods.length === 0) return null;

    const avg = validMoods.reduce((a, b) => a + b, 0) / validMoods.length;
    const dominantMood = Math.round(avg) as MoodLevel;

    return {
      avgMood: dominantMood,
      daysTracked: validMoods.length,
    };
  }, [weekMoods]);

  return (
    <Animated.View
      entering={FadeIn.delay(200)}
      style={[styles.container, { backgroundColor: nc.backgroundCard }]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: nc.textStrong }]}>
          Cette semaine
        </Text>
        {weekStats && (
          <View
            style={[
              styles.weekSummary,
              { backgroundColor: nc.backgroundPressed },
            ]}
          >
            <Text style={styles.weekSummaryEmoji}>
              {MOOD_EMOJIS[weekStats.avgMood]}
            </Text>
            <Text style={[styles.weekSummaryText, { color: nc.textLight }]}>
              {weekStats.daysTracked}/7 jours
            </Text>
          </View>
        )}
      </View>

      <View style={styles.weekRow}>
        {weekDays.map((day, index) => {
          const dayOfWeek = day.getDay();
          const adjustedIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const isCurrentDay = isSameDay(day, today);
          const isFuture = day > today;

          return (
            <DayCircle
              key={index}
              day={day}
              dayIndex={adjustedIndex}
              dominantMood={weekMoods[index]}
              isToday={isCurrentDay}
              isFuture={isFuture}
              index={index}
              nc={nc}
              moodColors={moodColors}
            />
          );
        })}
      </View>

      {!weekStats && (
        <Text style={[styles.emptyHint, { color: nc.textMuted }]}>
          Enregistrez des humeurs pour voir le récap
        </Text>
      )}
    </Animated.View>
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
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  weekSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  weekSummaryEmoji: {
    fontSize: 14,
  },
  weekSummaryText: {
    fontSize: 12,
    fontWeight: "500",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayColumn: {
    alignItems: "center",
    flex: 1,
  },
  dayName: {
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  dayEmoji: {
    fontSize: 18,
  },
  dayEmojiMuted: {
    opacity: 0.4,
  },
  dayDate: {
    fontSize: 11,
    marginTop: 6,
  },
  emptyHint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
});
