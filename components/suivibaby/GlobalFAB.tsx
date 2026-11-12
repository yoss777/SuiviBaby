import { radius, space } from "@/constants/tokens";
import { getNeutralColors, neutralColors, itemColors } from "@/constants/dashboardColors";
import {
  QUICK_ADD_ACTIONS,
  QUICK_ADD_CATEGORIES,
  type QuickAddAction,
  type QuickAddSheetParams,
} from "@/constants/dashboardConfig";
import { getQuickActionColors } from "@/constants/quickActionColors";
import { Colors } from "@/constants/theme";
import { type FormSheetProps, useSheetActions } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useNightMode } from "@/hooks/useNightMode";
import AsyncStorage from "@react-native-async-storage/async-storage";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SPRING_V3 } from "@/constants/motion";

const FAB_ACTION_KEYS = ["tetee", "miction", "vitamine"] as const;
const MAIN_FAB_SIZE = 56;
const ACTION_FAB_SIZE = 50;
const MAIN_FAB_ICON_SIZE = 24;
const ACTION_FAB_ICON_SIZE = 20;
const ACTION_OFFSET_STEP = 80; // Distance between action buttons when expanded
const ACTION_LABEL_OFFSET = ACTION_FAB_SIZE + 10;

type MoreAction = {
  key: "more";
  label: string;
  icon: QuickAddAction["icon"];
  isMore: true;
};

type FabAction = QuickAddAction | MoreAction;

const getQuickAddAction = (key: (typeof FAB_ACTION_KEYS)[number]) => {
  const action = QUICK_ADD_ACTIONS.find((item) => item.key === key);
  if (!action) {
    throw new Error(`Missing quick add action: ${key}`);
  }
  return action;
};

const ACTIONS: FabAction[] = [
  ...FAB_ACTION_KEYS.map(getQuickAddAction),
  {
    key: "more",
    label: "Plus",
    icon: { type: "fa", name: "ellipsis", color: neutralColors.textNormal },
    isMore: true,
  },
];

/** Pulsation d'invitation du FAB : une seule fois, à la toute première session. */
export const FAB_PULSE_SEEN_KEY = "fab_pulse_seen_v1";
let fabPulseSeenThisSession = false;

const FAB_ACTION_LABELS: Record<string, string> = {
  tetee: "Repas",
  miction: "Change",
};

// La couleur réelle vient de getQuickActionColors (tokens de catégorie).
const FAB_ACTION_ICONS: Record<string, QuickAddAction["icon"]> = {
  tetee: { type: "fa", name: "utensils", color: itemColors.biberon },
  miction: {
    type: "mc",
    name: "human-baby-changing-table",
    color: itemColors.miction,
  },
};

const getFabActionLabel = (action: FabAction) =>
  FAB_ACTION_LABELS[action.key] ?? action.label;

const getFabActionIcon = (action: FabAction) =>
  FAB_ACTION_ICONS[action.key] ?? action.icon;

const ActionButton = ({
  action,
  index,
  isOpen,
  onPress,
  labelTextColor,
  labelBackgroundColor,
  actionBackgroundColor,
  actionIconColor,
}: {
  action: FabAction;
  index: number;
  isOpen: boolean;
  onPress: () => void;
  labelTextColor: string;
  labelBackgroundColor: string;
  actionBackgroundColor: string;
  actionIconColor: string;
}) => {
  const actionLabel = getFabActionLabel(action);
  const actionIcon = getFabActionIcon(action);
  const offset = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    if (isOpen) {
      const delay = index * 50;
      const targetOffset = (index + 1) * ACTION_OFFSET_STEP;
      offset.value = withDelay(
        delay,
        withSpring(targetOffset, { ...SPRING_V3, damping: 12 }),
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
      scale.value = withDelay(delay, withSpring(1, { ...SPRING_V3, damping: 10 }));
    } else {
      offset.value = withSpring(0, SPRING_V3);
      opacity.value = withTiming(0, { duration: 150 });
      scale.value = withTiming(0.5, { duration: 150 });
    }
  }, [index, isOpen, offset, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    bottom: offset.value,
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.actionButtonWrapper, animatedStyle]}
      pointerEvents={isOpen ? "auto" : "none"}
      // Fermé : les actions sortent de l'arbre d'accessibilité (sinon
      // VoiceOver/TalkBack les lisent alors qu'elles sont invisibles).
      accessibilityElementsHidden={!isOpen}
      importantForAccessibility={isOpen ? "auto" : "no-hide-descendants"}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        hitSlop={8}
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: actionBackgroundColor },
          pressed && styles.actionButtonPressed,
        ]}
      >
        {actionIcon.type === "fa" ? (
          <FontAwesome6
            name={actionIcon.name as any}
            size={ACTION_FAB_ICON_SIZE}
            color={actionIconColor}
          />
        ) : (
          <MaterialCommunityIcons
            name={actionIcon.name as any}
            size={ACTION_FAB_ICON_SIZE}
            color={actionIconColor}
          />
        )}
      </Pressable>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.actionLabelContainer,
          { backgroundColor: labelBackgroundColor },
        ]}
      >
        <Text style={[styles.actionLabel, { color: labelTextColor }]}>
          {actionLabel}
        </Text>
      </View>
    </Animated.View>
  );
};

type GlobalFABProps = {
  /** Controlled menu state (VoiceDock coordinates it with the voice bar). */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Distance from the bottom of the parent; defaults to the safe-area based offset. */
  bottom?: number;
  /** Disables the main button, e.g. while a voice command is recording. */
  disabled?: boolean;
};

export const GlobalFAB = ({
  isOpen: isOpenProp,
  onOpenChange,
  bottom,
  disabled = false,
}: GlobalFABProps = {}) => {
  const { openSheet } = useSheetActions();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const nc = getNeutralColors(colorScheme);
  const insets = useSafeAreaInsets();
  const { isNightMode, minButtonSize, animations } = useNightMode();
  const [isOpenState, setIsOpenState] = useState(false);
  const isOpen = isOpenProp ?? isOpenState;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const setIsOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      const value = typeof next === "function" ? next(isOpenRef.current) : next;
      if (isOpenProp === undefined) setIsOpenState(value);
      onOpenChange?.(value);
    },
    [isOpenProp, onOpenChange],
  );
  const rotation = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const backdropOpacity = useSharedValue(0);
  const fabBottom = bottom ?? Math.max(insets.bottom + 6, 24);

  // Pulsation d'invitation : uniquement à la première session (jamais ensuite,
  // ni en mode nuit / animations réduites). Elle attirait l'œil à chaque écran.
  const [pulseAllowed, setPulseAllowed] = useState(false);
  useEffect(() => {
    if (fabPulseSeenThisSession) return;
    let cancelled = false;
    AsyncStorage.getItem(FAB_PULSE_SEEN_KEY)
      .then((seen) => {
        if (cancelled || seen || fabPulseSeenThisSession) return;
        fabPulseSeenThisSession = true;
        setPulseAllowed(true);
        return AsyncStorage.setItem(FAB_PULSE_SEEN_KEY, "1");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const hasPlayedPulse = useRef(false);
  useEffect(() => {
    if (!animations.decorative || !pulseAllowed) {
      pulseScale.value = 1;
      return;
    }
    if (!isOpen && !hasPlayedPulse.current) {
      hasPlayedPulse.current = true;
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, {
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        ),
        2,
      );
    } else if (isOpen) {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [animations.decorative, isOpen, pulseAllowed, pulseScale]);

  useEffect(() => {
    rotation.value = withSpring(isOpen ? 45 : 0, { ...SPRING_V3, damping: 12 });
    backdropOpacity.value = withTiming(isOpen ? 1 : 0, { duration: 200 });
  }, [backdropOpacity, isOpen, rotation]);

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
    (sheetParams: QuickAddSheetParams) => {
      const sheetProps = {
        ownerId: "global-fab",
        ...sheetParams,
      } as FormSheetProps;
      openSheet(sheetProps);
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
          {QUICK_ADD_CATEGORIES.map((category) => (
            <View key={category.key}>
              <Text
                style={[styles.quickSheetCategoryLabel, { color: nc.textLight }]}
                accessibilityRole="header"
              >
                {category.label}
              </Text>
              {category.actions.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={[
                    styles.quickSheetItem,
                    {
                      backgroundColor: nc.background,
                      borderColor: nc.borderLight,
                    },
                  ]}
                  onPress={() => handleQuickAddPress(action.sheetParams)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter ${action.label}`}
                >
                  <View
                    style={[
                      styles.quickSheetIcon,
                      { backgroundColor: nc.backgroundCard },
                    ]}
                  >
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
          ))}
        </View>
      ),
    });
  }, [colors, nc, handleQuickAddPress, openSheet]);

  const actionBusy = useRef(false);
  const actionBusyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (actionBusyTimeout.current) {
        clearTimeout(actionBusyTimeout.current);
      }
    },
    [],
  );

  const handleActionPress = useCallback(
    (action: FabAction) => {
      if (actionBusy.current) return;
      actionBusy.current = true;
      actionBusyTimeout.current = setTimeout(() => {
        actionBusy.current = false;
        actionBusyTimeout.current = null;
      }, 400);

      Haptics.impactAsync(
        isNightMode
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light,
      );
      setIsOpen(false);
      if ("isMore" in action) {
        openMoreSheet();
      } else {
        handleQuickAddPress(action.sheetParams);
      }
    },
    [handleQuickAddPress, isNightMode, openMoreSheet, setIsOpen],
  );

  // Menu ouvert : le bouton retour Android le referme au lieu de quitter l'écran
  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setIsOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [isOpen, setIsOpen]);

  const closeMenu = useCallback(() => setIsOpen(false), [setIsOpen]);

  const handleMainPress = useCallback(() => {
    Haptics.impactAsync(
      isNightMode
        ? Haptics.ImpactFeedbackStyle.Heavy
        : Haptics.ImpactFeedbackStyle.Medium,
    );
    setIsOpen((current) => !current);
  }, [isNightMode, setIsOpen]);

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        pointerEvents={isOpen ? "auto" : "none"}
        accessibilityElementsHidden={!isOpen}
        importantForAccessibility={isOpen ? "auto" : "no-hide-descendants"}
      >
        <Pressable
          style={styles.backdropPress}
          onPress={closeMenu}
          onAccessibilityEscape={closeMenu}
          accessibilityRole="button"
          accessibilityLabel="Fermer le menu"
        />
      </Animated.View>

      {/* FAB Container */}
      <View
        style={[styles.fabContainer, { bottom: fabBottom }]}
        // Geste « échappement » VoiceOver (Z à deux doigts) : referme le menu
        onAccessibilityEscape={isOpen ? closeMenu : undefined}
      >
        {/* Action buttons */}
        {ACTIONS.map((action, index) => {
          const actionColors = getQuickActionColors(action.key, colorScheme);
          return (
            <ActionButton
              key={action.key}
              action={action}
              index={index}
              isOpen={isOpen}
              onPress={() => handleActionPress(action)}
              labelTextColor={nc.textStrong}
              labelBackgroundColor={nc.backgroundCard}
              actionBackgroundColor={actionColors.backgroundColor}
              actionIconColor={actionColors.iconColor}
            />
          );
        })}

        {/* Main FAB */}
        <Pressable
          onPress={handleMainPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={
            isOpen ? "Fermer les actions rapides" : "Ouvrir les actions rapides"
          }
          accessibilityState={{ expanded: isOpen, disabled }}
          style={({ pressed }) => [
            disabled && styles.mainFabDisabled,
            styles.mainFab,
            { backgroundColor: Colors[colorScheme].tint },
            isNightMode && {
              width: Math.max(minButtonSize, MAIN_FAB_SIZE),
              height: Math.max(minButtonSize, MAIN_FAB_SIZE),
              borderRadius: Math.max(minButtonSize, MAIN_FAB_SIZE) / 2,
            },
            pressed && styles.mainFabPressed,
          ]}
        >
          <Animated.View style={mainButtonStyle}>
            <FontAwesome6
              name="plus"
              size={MAIN_FAB_ICON_SIZE}
              color={colors.onTint}
            />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
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
    width: MAIN_FAB_SIZE,
    height: MAIN_FAB_SIZE,
    borderRadius: MAIN_FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: neutralColors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  mainFabDisabled: {
    opacity: 0.4,
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
    width: ACTION_FAB_SIZE,
    height: ACTION_FAB_SIZE,
    borderRadius: ACTION_FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: neutralColors.shadow,
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
    right: ACTION_LABEL_OFFSET,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    shadowColor: neutralColors.shadow,
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
    paddingBottom: space.xs,
  },
  quickSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 10,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  quickSheetIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  quickSheetLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  quickSheetCategoryLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: space.sm,
    marginBottom: space.xxs,
    marginLeft: space.xxs,
  },
});
