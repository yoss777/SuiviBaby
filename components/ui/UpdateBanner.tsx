// components/ui/UpdateBanner.tsx
// Dismissible banner prompting user to update the app

import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface UpdateBannerProps {
  visible: boolean;
  latestVersion: string;
  storeUrl: string;
  forceUpdate?: boolean;
  onDismiss: () => void;
}

export const UpdateBanner = memo(function UpdateBanner({
  visible,
  latestVersion,
  storeUrl,
  forceUpdate = false,
  onDismiss,
}: UpdateBannerProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsVisible(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setIsVisible(false));
    }
  }, [visible, slideAnim]);

  const handleInstall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(storeUrl).catch(() => {});
  }, [storeUrl]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss();
  }, [onDismiss]);

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 8,
          backgroundColor: nc.backgroundCard,
          borderBottomColor: tint + "30",
          transform: [{ translateY: slideAnim }],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`Nouvelle version ${latestVersion} disponible`}
    >
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: tint + "15" }]}>
          <FontAwesome name="arrow-up-from-bracket" size={14} color={tint} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: nc.textStrong }]}>
            {"Mise à jour disponible"}
          </Text>
          <Text style={[styles.subtitle, { color: nc.textMuted }]}>
            {`Version ${latestVersion} est disponible`}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.installBtn, { backgroundColor: tint }]}
            onPress={handleInstall}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel="Installer la mise à jour"
            accessibilityHint="Ouvre le store pour mettre à jour"
          >
            <Text style={[styles.installText, { color: nc.white }]}>
              {"Installer"}
            </Text>
          </TouchableOpacity>
          {!forceUpdate && (
            <TouchableOpacity
              onPress={handleDismiss}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              accessibilityHint="Masquer la notification de mise à jour"
            >
              <FontAwesome name="xmark" size={14} color={nc.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9998,
    borderBottomWidth: 1,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 11,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  installBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  installText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
