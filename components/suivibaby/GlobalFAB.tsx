import { VoiceCommandButton } from "@/components/suivibaby/VoiceCommandButton";
import { Colors } from "@/constants/theme";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const ACTIONS = [
  // Position 5 (la plus proche - zone de pouce optimale)
  {
    key: "meal",
    icon: { lib: "fa6" as const, name: "utensils" },
    label: "Repas",
    color: "#E8785A",
    bgColor: "#FEF5F3",
    formType: "meals" as const,
    mealType: "tetee" as const,
  },
  // Position 4 (très accessible)
  {
    key: "diaper",
    icon: { lib: "fa6" as const, name: "baby" },
    label: "Change",
    color: "#17a2b8",
    bgColor: "#d1ecf1",
    formType: "diapers" as const,
    diapersType: "miction" as const,
  },
  // Position 3 (milieu - action polyvalente)
  {
    key: "voice",
    icon: { lib: "fa6" as const, name: "microphone" },
    label: "Vocal",
    color: "#10b981",
    bgColor: "#d1fae5",
    isVoiceCommand: true as const,
  },
  // Position 2 (accessible avec léger ajustement)
  {
    key: "sleep",
    icon: { lib: "fa6" as const, name: "bed" },
    label: "Sommeil",
    color: "#7C6BA4",
    bgColor: "#F5F3F8",
    formType: "routines" as const,
    routineType: "sommeil" as const,
  },
  // Position 1 (la plus éloignée - action réfléchie)
  {
    key: "milestone",
    icon: { lib: "fa6" as const, name: "camera" },
    label: "Moment",
    color: "#4A90E2",
    bgColor: "#dbeafe",
    formType: "milestones" as const,
    jalonType: "photo" as const,
  },
];

const ActionButton = ({
  action,
  index,
  isOpen,
  onPress,
  labelTextColor,
  labelBackgroundColor,
}: {
  action: (typeof ACTIONS)[0];
  index: number;
  isOpen: boolean;
  onPress: () => void;
  labelTextColor: string;
  labelBackgroundColor: string;
}) => {
  const offset = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    if (isOpen) {
      const delay = index * 50;
      offset.value = withDelay(
        delay,
        withSpring((index + 1) * 76, { damping: 12 }),
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
      scale.value = withDelay(delay, withSpring(1, { damping: 10 }));
    } else {
      offset.value = withSpring(0);
      opacity.value = withTiming(0, { duration: 150 });
      scale.value = withTiming(0.5, { duration: 150 });
    }
  }, [isOpen]);

  const animatedStyle = useAnimatedStyle(() => ({
    bottom: offset.value,
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  // Special rendering for voice command button
  if ("isVoiceCommand" in action && action.isVoiceCommand) {
    return (
      <Animated.View
        style={[styles.actionButtonWrapper, animatedStyle]}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <View
          style={[styles.actionButton, { backgroundColor: action.bgColor }]}
        >
          <VoiceCommandButton
            size={20}
            color={action.color}
            showTestToggle={false}
            accessibilityLabel="Commande vocale"
          />
        </View>
        <View
          style={[
            styles.actionLabelContainer,
            { backgroundColor: labelBackgroundColor },
          ]}
        >
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={8}
          >
            <Text style={[styles.actionLabel, { color: labelTextColor }]}>
              {action.label}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[styles.actionButtonWrapper, animatedStyle]}
      pointerEvents={isOpen ? "auto" : "none"}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        hitSlop={8}
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: action.bgColor },
          pressed && styles.actionButtonPressed,
        ]}
      >
        {action.icon.lib === "fa6" ? (
          <FontAwesome6
            name={action.icon.name as any}
            size={20}
            color={action.color}
          />
        ) : (
          <MaterialCommunityIcons
            name={action.icon.name as any}
            size={20}
            color={action.color}
          />
        )}
      </Pressable>
      <View
        style={[
          styles.actionLabelContainer,
          { backgroundColor: labelBackgroundColor },
        ]}
      >
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={8}
        >
          <Text style={[styles.actionLabel, { color: labelTextColor }]}>
            {action.label}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};

// Helper function for delayed animations
const withDelay = (delay: number, animation: any) => {
  "worklet";
  return withSequence(withTiming(0, { duration: delay }), animation);
};

export const GlobalFAB = ({
  includeVoiceAction = true,
}: {
  includeVoiceAction?: boolean;
}) => {
  const { openSheet } = useSheet();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const [isOpen, setIsOpen] = useState(false);
  const rotation = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const backdropOpacity = useSharedValue(0);

  // Subtle pulse animation when closed
  useEffect(() => {
    if (!isOpen) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, {
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
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
  }));

  const handleActionPress = (action: (typeof ACTIONS)[0]) => {
    setIsOpen(false);
    if (action.formType === "meals") {
      openSheet({
        ownerId: "global-fab",
        formType: "meals",
        mealType: action.mealType,
      });
    } else if (action.formType === "diapers") {
      openSheet({
        ownerId: "global-fab",
        formType: "diapers",
        diapersType: action.diapersType,
      });
    } else if (action.formType === "routines") {
      openSheet({
        ownerId: "global-fab",
        formType: "routines",
        routineType: action.routineType,
      });
    } else if (action.formType === "milestones") {
      openSheet({
        ownerId: "global-fab",
        formType: "milestones",
        jalonType: action.jalonType,
      });
    }
  };

  const actions = includeVoiceAction
    ? ACTIONS
    : ACTIONS.filter((action) => !("isVoiceCommand" in action));

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <Pressable
          style={styles.backdropPress}
          onPress={() => setIsOpen(false)}
        />
      </Animated.View>

      {/* FAB Container */}
      <View style={styles.fabContainer}>
        {/* Action buttons */}
        {actions.map((action, index) => (
          <ActionButton
            key={action.key}
            action={action}
            index={index}
            isOpen={isOpen}
            onPress={() => handleActionPress(action)}
            labelTextColor={colors.text}
            labelBackgroundColor={colors.card ?? colors.background}
          />
        ))}

        {/* Main FAB */}
        <Pressable
          onPress={() => setIsOpen(!isOpen)}
          accessibilityRole="button"
          accessibilityLabel={
            isOpen ? "Fermer les actions rapides" : "Ouvrir les actions rapides"
          }
          style={({ pressed }) => [
            styles.mainFab,
            { backgroundColor: Colors[colorScheme].tint },
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
    zIndex: 1,
    elevation: 1,
  },
  backdropPress: {
    flex: 1,
  },
  fabContainer: {
    position: "absolute",
    bottom: 32,
    right: 20,
    alignItems: "center",
    zIndex: 2,
    elevation: 2,
  },
  mainFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
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
    zIndex: 3,
    elevation: 3,
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
  },
});
