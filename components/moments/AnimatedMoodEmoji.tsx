import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SPRING_V3 } from "@/constants/motion";

const MOOD_EMOJIS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "😢",
  2: "😐",
  3: "🙂",
  4: "😄",
  5: "🥰",
};

type AnimatedMoodEmojiProps = {
  mood: 1 | 2 | 3 | 4 | 5;
};

export const AnimatedMoodEmoji = ({ mood }: AnimatedMoodEmojiProps) => {
  const scale = useSharedValue(0.5);
  const rotation = useSharedValue(-10);

  useEffect(() => {
    scale.value = withSpring(1, { ...SPRING_V3, damping: 12, stiffness: 100 });
    rotation.value = withSequence(
      withTiming(10, { duration: 150 }),
      withTiming(-10, { duration: 150 }),
      withTiming(5, { duration: 100 }),
      withTiming(0, { duration: 100 })
    );
  }, [mood]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.Text style={[styles.moodEmojiLarge, animatedStyle]}>
      {MOOD_EMOJIS[mood]}
    </Animated.Text>
  );
};

const styles = StyleSheet.create({
  moodEmojiLarge: {
    fontSize: 64,
  },
});
