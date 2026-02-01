import { PulsingAura } from "@/components/moments/PulsingAura";
import { eventColors } from "@/constants/eventColors";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type MoodLevel = 1 | 2 | 3 | 4 | 5;

type HeroMoodCardProps = {
  mood: MoodLevel | null;
  babyName?: string;
  time?: string;
  onAddMood: (mood?: MoodLevel) => void;
};

const MOOD_DATA: Record<
  MoodLevel,
  {
    emoji: string;
    message: string;
    gradient: [string, string, string];
    icons: string[];
    auraColor: string;
  }
> = {
  1: {
    emoji: "😢",
    message: "a besoin de câlins",
    gradient: ["#fef2f2", "#fee2e2", "#fecaca"],
    icons: ["cloud-rain", "heart"],
    auraColor: "#fca5a5",
  },
  2: {
    emoji: "😐",
    message: "est un peu grognon",
    gradient: ["#fffbeb", "#fef3c7", "#fde68a"],
    icons: ["cloud", "cloud"],
    auraColor: "#fcd34d",
  },
  3: {
    emoji: "🙂",
    message: "va bien",
    gradient: ["#eff6ff", "#dbeafe", "#bfdbfe"],
    icons: ["cloud-sun", "star"],
    auraColor: "#93c5fd",
  },
  4: {
    emoji: "😄",
    message: "est de bonne humeur",
    gradient: ["#f0fdf4", "#dcfce7", "#bbf7d0"],
    icons: ["sun", "star"],
    auraColor: "#86efac",
  },
  5: {
    emoji: "🥰",
    message: "rayonne de bonheur",
    gradient: ["#fdf2f8", "#fce7f3", "#fbcfe8"],
    icons: ["sparkles", "heart", "star"],
    auraColor: "#f9a8d4",
  },
};

// Floating icon component
const FloatingIcon = ({
  icon,
  delay,
  x,
  y,
  size,
  color,
}: {
  icon: string;
  delay: number;
  x: number;
  y: number;
  size: number;
  color: string;
}) => {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.ease) })
        ),
        -1
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value * 0.6,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -15]) },
      { rotate: `${interpolate(progress.value, [0, 1], [-5, 5])}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.floatingIcon, { left: x, top: y }, animatedStyle]}>
      <FontAwesome6 name={icon} size={size} color={color} />
    </Animated.View>
  );
};

// Animated emoji component
const AnimatedEmoji = ({ emoji }: { emoji: string }) => {
  const scale = useSharedValue(0.3);
  const rotation = useSharedValue(-15);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 100 });
    rotation.value = withSequence(
      withTiming(10, { duration: 150 }),
      withTiming(-8, { duration: 150 }),
      withTiming(5, { duration: 100 }),
      withTiming(0, { duration: 100 })
    );
  }, [emoji]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.Text style={[styles.heroEmoji, animatedStyle]}>
      {emoji}
    </Animated.Text>
  );
};

export const HeroMoodCard = ({
  mood,
  babyName = "Bébé",
  time,
  onAddMood,
}: HeroMoodCardProps) => {
  const cardScale = useSharedValue(0.95);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    cardOpacity.value = withTiming(1, { duration: 400 });
    cardScale.value = withSpring(1, { damping: 15 });
  }, []);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const moodData = mood ? MOOD_DATA[mood] : null;

  const floatingIcons = useMemo(() => {
    if (!moodData) return [];
    const positions = [
      { x: 30, y: 20, size: 16, delay: 0 },
      { x: SCREEN_WIDTH - 100, y: 35, size: 14, delay: 300 },
      { x: 50, y: 120, size: 12, delay: 600 },
      { x: SCREEN_WIDTH - 80, y: 100, size: 18, delay: 200 },
      { x: SCREEN_WIDTH / 2 - 80, y: 15, size: 10, delay: 500 },
    ];
    return positions.map((pos, i) => ({
      ...pos,
      icon: moodData.icons[i % moodData.icons.length],
      color: moodData.gradient[1],
    }));
  }, [moodData]);

  if (!mood) {
    return (
      <Animated.View style={[styles.heroCard, cardAnimatedStyle]}>
        <LinearGradient
          colors={["#f8f9fa", "#e9ecef", "#dee2e6"]}
          style={styles.heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.heroEmojiEmpty}>🌤️</Text>
          <Text style={styles.heroTitle}>Comment va {babyName} ?</Text>
          <Text style={styles.heroSubtitle}>
            Touchez une humeur pour commencer
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.emojiRow}
          >
            {([1, 2, 3, 4, 5] as MoodLevel[]).map((level) => (
              <Pressable
                key={level}
                style={({ pressed }) => [
                  styles.emojiButton,
                  pressed && styles.emojiButtonPressed,
                ]}
                onPress={() => onAddMood(level)}
              >
                <Text style={styles.emojiButtonText}>
                  {MOOD_DATA[level].emoji}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.heroCard, cardAnimatedStyle]}>
      <LinearGradient
        colors={moodData!.gradient}
        style={styles.heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Floating decorative icons */}
        {floatingIcons.map((icon, i) => (
          <FloatingIcon key={i} {...icon} />
        ))}

        {/* Pulsing aura behind emoji */}
        <View style={styles.emojiWrapper}>
          <PulsingAura color={moodData!.auraColor} size={60} />
          <AnimatedEmoji emoji={moodData!.emoji} />
        </View>

        <Text style={styles.heroTitle}>
          {babyName} {moodData!.message}
        </Text>

        {time && <Text style={styles.heroTime}>à {time}</Text>}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.emojiRowSmall}
        >
          {([1, 2, 3, 4, 5] as MoodLevel[]).map((level) => (
            <Pressable
              key={level}
              style={({ pressed }) => [
                styles.emojiButtonSmall,
                level === mood && styles.emojiButtonActive,
                pressed && styles.emojiButtonPressed,
              ]}
              onPress={() => onAddMood(level)}
            >
              <Text style={styles.emojiButtonTextSmall}>
                {MOOD_DATA[level].emoji}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  heroCard: {
    marginHorizontal: 16,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  heroGradient: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    minHeight: 220,
    justifyContent: "center",
  },
  emojiWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  floatingIcon: {
    position: "absolute",
  },
  heroEmoji: {
    fontSize: 80,
    marginBottom: 12,
  },
  heroEmojiEmpty: {
    fontSize: 64,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1f2937",
    textAlign: "center",
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 20,
  },
  heroTime: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
  },
  addMoodButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: eventColors.jalon.dark,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 50,
  },
  addMoodButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  updateMoodButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  updateMoodText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  buttonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9,
  },
  emojiRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 8,
  },
  emojiButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  emojiButtonPressed: {
    transform: [{ scale: 0.9 }],
    backgroundColor: "rgba(255, 255, 255, 1)",
  },
  emojiButtonText: {
    fontSize: 24,
  },
  emojiRowSmall: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emojiButtonSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  emojiButtonActive: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderWidth: 2,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  emojiButtonTextSmall: {
    fontSize: 20,
  },
});
