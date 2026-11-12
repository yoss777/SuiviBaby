import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { neutralColors } from "@/constants/dashboardColors";

type AnimatedCounterProps = {
  value: number;
  label: string;
  color: string;
  icon: string;
  delay?: number;
};

export const AnimatedCounter = ({
  value,
  label,
  color,
  icon,
  delay = 0,
}: AnimatedCounterProps) => {
  const displayValue = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 300 });
      displayValue.value = withTiming(value, { duration: 800 });
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  const counterStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: interpolate(opacity.value, [0, 1], [20, 0]) }],
  }));

  return (
    <Animated.View style={[styles.statCard, counterStyle]}>
      <View
        style={[styles.statIconContainer, { backgroundColor: `${color}20` }]}
      >
        <FontAwesome6 name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  statCard: {
    flex: 1,
    backgroundColor: neutralColors.white,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: neutralColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    color: neutralColors.textLight,
    marginTop: 2,
  },
});
