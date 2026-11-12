// components/suivibaby/dashboard/TipsCarousel.tsx
// Horizontal carousel of tips with dots indicator and auto-scroll
// (jamais la nuit, avec « Réduire les animations » ou un lecteur d'écran)

import { getNeutralColors } from "@/constants/dashboardColors";
import type { Tip } from "@/types/content";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ListViewToken,
} from "react-native";
import { useScreenReaderEnabled } from "@/hooks/useScreenReaderEnabled";
import { isReduceMotionEnabled } from "@/utils/motion";
import { shouldAutoScrollTips } from "@/utils/tipsAutoScroll";
import { SmartFeedCard } from "./SmartFeedCard";

interface TipsCarouselProps {
  tips: Tip[];
  bookmarkedIds: string[];
  onRead: (tip: Tip) => void;
  onDismiss: (tipId: string) => void;
  onBookmark: (tipId: string) => void;
  colorScheme?: "light" | "dark";
  autoScrollInterval?: number; // ms, 0 to disable
}

const AUTO_SCROLL_MS = 8000;

export const TipsCarousel = memo(function TipsCarousel({
  tips,
  bookmarkedIds,
  onRead,
  onDismiss,
  onBookmark,
  colorScheme = "light",
  autoScrollInterval = AUTO_SCROLL_MS,
}: TipsCarouselProps) {
  const nc = getNeutralColors(colorScheme);
  const flatListRef = useRef<FlatList<Tip>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const userInteractedRef = useRef(false);
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cardWidth = Dimensions.get("window").width - 40; // paddingHorizontal: 20
  const [cardHeight, setCardHeight] = useState(0);
  const measuredHeights = useRef<Record<number, number>>({});
  const measureCount = useRef(0);

  const onCardLayout = useCallback(
    (index: number, event: LayoutChangeEvent) => {
      const h = event.nativeEvent.layout.height;
      if (measuredHeights.current[index] === h) return;
      measuredHeights.current[index] = h;
      measureCount.current += 1;
      // Once all cards are measured, set the max height
      if (measureCount.current >= tips.length) {
        const maxH = Math.max(...Object.values(measuredHeights.current));
        if (maxH > 0 && maxH !== cardHeight) {
          setCardHeight(maxH);
        }
      }
    },
    [tips.length, cardHeight],
  );

  // Track visible item
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        const idx = viewableItems[0].index;
        setCurrentIndex(idx);
        currentIndexRef.current = idx;
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  // Lecteur d'écran : le défilement automatique déplacerait le focus (WCAG 2.2.2)
  const screenReaderEnabled = useScreenReaderEnabled();
  const screenReaderRef = useRef(screenReaderEnabled);
  screenReaderRef.current = screenReaderEnabled;

  // Une avance d'une carte, seulement si la règle l'autorise À CET INSTANT :
  // l'heure est relue à chaque tick (un carrousel monté à 21 h 59 s'arrête à 22 h).
  const advance = useCallback(() => {
    if (userInteractedRef.current) return;
    if (
      !shouldAutoScrollTips({
        now: new Date(),
        reduceMotion: isReduceMotionEnabled(),
        screenReaderEnabled: screenReaderRef.current,
      })
    ) {
      return;
    }
    const nextIndex = (currentIndexRef.current + 1) % tips.length;
    flatListRef.current?.scrollToIndex({
      index: nextIndex,
      animated: true,
    });
    currentIndexRef.current = nextIndex;
    setCurrentIndex(nextIndex);
  }, [tips.length]);

  const autoScrollEnabled =
    autoScrollInterval > 0 && tips.length > 1 && !screenReaderEnabled;

  // Auto-scroll
  useEffect(() => {
    if (!autoScrollEnabled) return;

    autoScrollTimerRef.current = setInterval(advance, autoScrollInterval);

    return () => {
      if (autoScrollTimerRef.current) {
        clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current);
      }
    };
  }, [autoScrollEnabled, autoScrollInterval, advance]);

  // Pause auto-scroll on user interaction
  const onScrollBeginDrag = useCallback(() => {
    userInteractedRef.current = true;
  }, []);

  // Resume auto-scroll after 15s of no interaction
  const onScrollEndDrag = useCallback(() => {
    if (!autoScrollEnabled) return;

    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => {
      userInteractedRef.current = false;
    }, 15000);
  }, [autoScrollEnabled]);

  const renderItem = useCallback(
    ({ item, index }: { item: Tip; index: number }) => (
      <View
        style={{
          width: cardWidth,
          height: cardHeight > 0 ? cardHeight : undefined,
        }}
        onLayout={(e) => onCardLayout(index, e)}
      >
        <SmartFeedCard
          tip={item}
          isBookmarked={bookmarkedIds.includes(item.id)}
          onRead={onRead}
          onDismiss={onDismiss}
          onBookmark={onBookmark}
          colorScheme={colorScheme}
        />
      </View>
    ),
    [
      cardWidth,
      cardHeight,
      bookmarkedIds,
      onRead,
      onDismiss,
      onBookmark,
      onCardLayout,
      colorScheme,
    ],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: cardWidth,
      offset: cardWidth * index,
      index,
    }),
    [cardWidth],
  );

  if (tips.length === 0) return null;

  // Single tip: no carousel
  if (tips.length === 1) {
    return (
      <SmartFeedCard
        tip={tips[0]}
        isBookmarked={bookmarkedIds.includes(tips[0].id)}
        onRead={onRead}
        onDismiss={onDismiss}
        onBookmark={onBookmark}
        colorScheme={colorScheme}
      />
    );
  }

  return (
    // Pas de rôle « adjustable » sur le conteneur : il regrouperait les cartes
    // en un seul élément et rendrait leurs boutons (Lire, Enregistrer)
    // inatteignables au lecteur d'écran. Chaque carte reste parcourable.
    <View>
      <FlatList
        ref={flatListRef}
        data={tips}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        getItemLayout={getItemLayout}
        decelerationRate="fast"
        snapToInterval={cardWidth}
        snapToAlignment="start"
        contentContainerStyle={styles.listContent}
      />

      {/* Dots indicator */}
      <View style={styles.dotsContainer} accessibilityElementsHidden>
        {tips.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor:
                  i === currentIndex ? nc.textStrong : nc.borderLight,
              },
              i === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  listContent: {
    // no extra padding — parent handles it
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 16,
    borderRadius: 3,
  },
});
