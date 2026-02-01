import { eventColors } from "@/constants/eventColors";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type FloatingActionButtonProps = {
  onMoodPress: () => void;
  onPhotoPress: () => void;
  onMilestonePress: () => void;
};

const ACTIONS = [
  {
    key: "mood",
    icon: "heart",
    label: "Humeur",
    color: "#ec4899",
    bgColor: "#fce7f3",
  },
  {
    key: "photo",
    icon: "camera",
    label: "Photo",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
  },
  {
    key: "milestone",
    icon: "star",
    label: "Jalon",
    color: eventColors.jalon.dark,
    bgColor: eventColors.jalon.light,
  },
];

const ActionButton = ({
  action,
  index,
  isOpen,
  onPress,
}: {
  action: (typeof ACTIONS)[0];
  index: number;
  isOpen: boolean;
  onPress: () => void;
}) => {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    if (isOpen) {
      const delay = index * 50;
      translateY.value = withDelay(
        delay,
        withSpring(-(index + 1) * 70, { damping: 12 })
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
      scale.value = withDelay(delay, withSpring(1, { damping: 10 }));
    } else {
      translateY.value = withSpring(0);
      opacity.value = withTiming(0, { duration: 150 });
      scale.value = withTiming(0.5, { duration: 150 });
    }
  }, [isOpen]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.actionButtonWrapper, animatedStyle]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: action.bgColor },
          pressed && styles.actionButtonPressed,
        ]}
      >
        <FontAwesome6 name={action.icon} size={20} color={action.color} />
      </Pressable>
      <View style={styles.actionLabelContainer}>
        <Text style={styles.actionLabel}>{action.label}</Text>
      </View>
    </Animated.View>
  );
};

// Helper function for delayed animations
const withDelay = (delay: number, animation: any) => {
  "worklet";
  return withSequence(withTiming(0, { duration: delay }), animation);
};

export const FloatingActionButton = ({
  onMoodPress,
  onPhotoPress,
  onMilestonePress,
}: FloatingActionButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const rotation = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const backdropOpacity = useSharedValue(0);

  // Subtle pulse animation when closed
  useEffect(() => {
    if (!isOpen) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isOpen]);

  useEffect(() => {
    rotation.value = withSpring(isOpen ? 45 : 0, { damping: 12 });
    backdropOpacity.value = withTiming(isOpen ? 1 : 0, { duration: 200 });
  }, [isOpen]);

  const mainButtonStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: isOpen ? 1 : pulseScale.value },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: isOpen ? "auto" : "none",
  }));

  const handleActionPress = (key: string) => {
    setIsOpen(false);
    setTimeout(() => {
      if (key === "mood") onMoodPress();
      else if (key === "photo") onPhotoPress();
      else if (key === "milestone") onMilestonePress();
    }, 150);
  };

  return (
    <>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={styles.backdropPress} onPress={() => setIsOpen(false)} />
      </Animated.View>

      {/* FAB Container */}
      <View style={styles.fabContainer}>
        {/* Action buttons */}
        {ACTIONS.map((action, index) => (
          <ActionButton
            key={action.key}
            action={action}
            index={index}
            isOpen={isOpen}
            onPress={() => handleActionPress(action.key)}
          />
        ))}

        {/* Main FAB */}
        <Pressable
          onPress={() => setIsOpen(!isOpen)}
          style={({ pressed }) => [
            styles.mainFab,
            pressed && styles.mainFabPressed,
          ]}
        >
          <Animated.View style={mainButtonStyle}>
            <FontAwesome6 name="plus" size={24} color="#fff" />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    zIndex: 90,
  },
  backdropPress: {
    flex: 1,
  },
  fabContainer: {
    position: "absolute",
    bottom: 100,
    right: 20,
    alignItems: "center",
    zIndex: 100,
  },
  mainFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: eventColors.jalon.dark,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: eventColors.jalon.dark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  mainFabPressed: {
    transform: [{ scale: 0.95 }],
  },
  actionButtonWrapper: {
    position: "absolute",
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  actionButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  actionLabelContainer: {
    position: "absolute",
    right: 60,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
});
