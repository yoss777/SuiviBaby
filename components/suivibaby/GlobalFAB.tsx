import { VoiceCommandButton } from "@/components/suivibaby/VoiceCommandButton";
import { QUICK_ADD_ACTIONS } from "@/constants/dashboardConfig";
import { Colors } from "@/constants/theme";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
    key: "pumping",
    icon: { lib: "fa6" as const, name: "pump-medical" },
    label: "Tire-lait",
    color: "#28a745",
    bgColor: "#f0f8f4",
    formType: "pumping" as const,
  },
  // Position 4 (très accessible)
  {
    key: "diaper",
    icon: { lib: "mci" as const, name: "human-baby-changing-table" },
    label: "Couche",
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
    key: "milestone",
    icon: { lib: "fa6" as const, name: "camera" },
    label: "Moment",
    color: "#4A90E2",
    bgColor: "#dbeafe",
    formType: "milestones" as const,
    jalonType: "photo" as const,
  },
  // Position 1 (la plus éloignée - action réfléchie)
  {
    key: "more",
    icon: { lib: "fa6" as const, name: "ellipsis" },
    label: "Plus",
    color: "#6B7280",
    bgColor: "#F3F4F6",
    isMore: true as const,
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
  const insets = useSafeAreaInsets();
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

  const handleQuickAddPress = useCallback(
    (route: string) => {
      const soinsMatch = route.match(/soins\?type=(\w+)/);
      if (soinsMatch) {
        openSheet({ ownerId: "global-fab", formType: "soins", soinsType: soinsMatch[1] as any });
        return;
      }
      const mealsMatch = route.match(/meals\?tab=(\w+)/);
      if (mealsMatch) {
        const map: Record<string, "tetee" | "biberon" | "solide"> = { seins: "tetee", tetee: "tetee", biberons: "biberon", biberon: "biberon", solide: "solide", solides: "solide" };
        const mealType = map[mealsMatch[1]];
        if (mealType) { openSheet({ ownerId: "global-fab", formType: "meals", mealType }); return; }
      }
      if (route.includes("pumping") && route.includes("openModal=true")) {
        openSheet({ ownerId: "global-fab", formType: "pumping" }); return;
      }
      if (route.includes("activities") && route.includes("openModal=true")) {
        openSheet({ ownerId: "global-fab", formType: "activities", activiteType: "tummyTime" }); return;
      }
      const milestonesMatch = route.match(/milestones\?type=(\w+)/);
      if (milestonesMatch) {
        openSheet({ ownerId: "global-fab", formType: "milestones", jalonType: milestonesMatch[1] as any }); return;
      }
      if (route.includes("milestones") && route.includes("openModal=true")) {
        openSheet({ ownerId: "global-fab", formType: "milestones", jalonType: "photo" }); return;
      }
      const diapersMatch = route.match(/diapers\?tab=(\w+)/);
      if (diapersMatch) {
        const map: Record<string, "miction" | "selle"> = { mictions: "miction", miction: "miction", selles: "selle", selle: "selle" };
        const diapersType = map[diapersMatch[1]];
        if (diapersType) { openSheet({ ownerId: "global-fab", formType: "diapers", diapersType }); return; }
      }
      if (route.includes("routines") && route.includes("openModal=true")) {
        const typeMatch = route.match(/type=(\w+)/);
        const routineType = typeMatch?.[1] as "sommeil" | "bain" | undefined;
        if (routineType === "sommeil") { openSheet({ ownerId: "global-fab", formType: "routines", routineType: "sommeil", sleepMode: "nap" }); return; }
        if (routineType === "bain") { openSheet({ ownerId: "global-fab", formType: "routines", routineType: "bain" }); return; }
      }
      if (route.includes("croissance") && route.includes("openModal=true")) {
        openSheet({ ownerId: "global-fab", formType: "croissance" }); return;
      }
    },
    [openSheet],
  );

  const openMoreSheet = useCallback(() => {
    openSheet({
      ownerId: "global-fab-more",
      title: "Ajouter un événement",
      icon: "plus",
      accentColor: colors.tint,
      showActions: false,
      onSubmit: () => {},
      snapPoints: ["55%", "75%"],
      children: (
        <View style={styles.quickSheetList}>
          {QUICK_ADD_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.quickSheetItem}
              onPress={() => handleQuickAddPress(action.route)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter ${action.label}`}
            >
              <View style={styles.quickSheetIcon}>
                {action.icon.type === "mc" ? (
                  <MaterialCommunityIcons
                    name={action.icon.name as any}
                    size={18}
                    color={action.icon.color}
                  />
                ) : (
                  <FontAwesome6
                    name={action.icon.name as any}
                    size={18}
                    color={action.icon.color}
                  />
                )}
              </View>
              <Text
                style={[styles.quickSheetLabel, { color: colors.text }]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ),
    });
  }, [colors, handleQuickAddPress, openSheet]);

  const handleActionPress = (action: (typeof ACTIONS)[0]) => {
    setIsOpen(false);
    if ("isMore" in action) {
      openMoreSheet();
    } else if (action.formType === "meals") {
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
    } else if (action.formType === "milestones") {
      openSheet({
        ownerId: "global-fab",
        formType: "milestones",
        jalonType: action.jalonType,
      });
    } else if (action.formType === "pumping") {
      openSheet({
        ownerId: "global-fab",
        formType: "pumping",
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
      <View style={[styles.fabContainer, { bottom: Platform.OS === "ios" ? 16 + insets.bottom + 49 : 32 }]}>
        {/* Action buttons */}
        {actions.map((action, index) => (
          <ActionButton
            key={action.key}
            action={action}
            index={index}
            isOpen={isOpen}
            onPress={() => handleActionPress(action)}
            labelTextColor={colors.text}
            labelBackgroundColor={colors.background}
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
  quickSheetList: {
    gap: 10,
    paddingBottom: 8,
  },
  quickSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  quickSheetIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  quickSheetLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
});
