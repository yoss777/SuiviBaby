// components/ui/ChangelogModal.tsx
// "What's new" modal displayed after app updates

import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import type { ChangelogEntry } from "@/types/content";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

interface ChangelogModalProps {
  visible: boolean;
  entries: ChangelogEntry[];
  onClose: () => void;
  colorScheme?: "light" | "dark";
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 64;

export const ChangelogModal = memo(function ChangelogModal({
  visible,
  entries,
  onClose,
  colorScheme = "light",
}: ChangelogModalProps) {
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible, fadeAnim]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [onClose, fadeAnim]);

  const handleNext = useCallback(() => {
    if (currentIndex < entries.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      handleClose();
    }
  }, [currentIndex, entries.length, handleClose]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
      if (index !== currentIndex && index >= 0 && index < entries.length) {
        setCurrentIndex(index);
      }
    },
    [currentIndex, entries.length],
  );

  const renderEntry = useCallback(
    ({ item }: { item: ChangelogEntry }) => (
      <View style={[styles.slide, { width: CARD_WIDTH }]}>
        {/* Version badge */}
        <View style={[styles.versionBadge, { backgroundColor: tint + "15" }]}>
          <Text style={[styles.versionText, { color: tint }]}>
            v{item.version}
          </Text>
        </View>

        {/* Title */}
        <Text style={[styles.slideTitle, { color: nc.textStrong }]}>
          {item.title}
        </Text>

        {/* Date */}
        <Text style={[styles.slideDate, { color: nc.textMuted }]}>
          {item.date}
        </Text>

        {/* Features */}
        <View style={styles.featuresList}>
          {item.features.map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <View
                style={[
                  styles.featureIcon,
                  { backgroundColor: tint + "12" },
                ]}
              >
                <FontAwesome
                  name={feature.icon || "sparkles"}
                  size={14}
                  color={tint}
                />
              </View>
              <Text
                style={[styles.featureText, { color: nc.textNormal }]}
              >
                {feature.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
    ),
    [nc, tint],
  );

  if (!visible || entries.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <Animated.View
        style={[styles.overlay, { opacity: fadeAnim }]}
      >
        <View style={[styles.container, { backgroundColor: nc.background }]}>
          {/* Header */}
          <View style={styles.header}>
            <FontAwesome name="sparkles" size={20} color={tint} />
            <Text style={[styles.headerTitle, { color: nc.textStrong }]}>
              Quoi de neuf ?
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <FontAwesome name="xmark" size={18} color={nc.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Carousel */}
          <FlatList
            ref={flatListRef}
            data={entries}
            renderItem={renderEntry}
            keyExtractor={(item) => item.version}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            getItemLayout={(_, index) => ({
              length: CARD_WIDTH,
              offset: CARD_WIDTH * index,
              index,
            })}
            contentContainerStyle={styles.carousel}
          />

          {/* Dots */}
          {entries.length > 1 && (
            <View style={styles.dots}>
              {entries.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        i === currentIndex ? tint : nc.borderLight,
                    },
                    i === currentIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          )}

          {/* CTA button */}
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: tint }]}
            onPress={handleNext}
            accessibilityRole="button"
            accessibilityLabel={
              currentIndex === entries.length - 1 ? "Compris" : "Suivant"
            }
          >
            <Text style={styles.ctaText}>
              {currentIndex === entries.length - 1 ? "Compris !" : "Suivant"}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    width: "100%",
    maxHeight: "80%",
    borderRadius: 20,
    overflow: "hidden",
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    marginLeft: 8,
  },
  carousel: {
    paddingHorizontal: 8,
  },
  slide: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  versionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 12,
  },
  versionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  slideTitle: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    marginBottom: 4,
  },
  slideDate: {
    fontSize: 12,
    marginBottom: 16,
  },
  featuresList: {
    gap: 12,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    borderRadius: 3,
  },
  ctaButton: {
    marginHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
