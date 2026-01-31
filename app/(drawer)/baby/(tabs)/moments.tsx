import {
  AnimatedCounter,
  AnimatedMoodEmoji,
  FloatingBlob,
  FloatingParticle,
  MoodBackdrop,
  PulsingAura,
  SparkleBurst,
} from "@/components/moments";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { eventColors } from "@/constants/eventColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ecouterJalonsHybrid } from "@/migration/eventsHybridService";
import { JalonEvent } from "@/services/eventsService";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  Skia,
  Text as SkiaText,
  useFont,
  vec,
} from "@shopify/react-native-skia";
import { LinearGradient as ExpoLinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft } from "../../_layout";

// ============================================
// TYPES
// ============================================

type MilestoneEventWithId = JalonEvent & { id: string };

type MoodEntry = {
  id: string;
  date: Date;
  humeur: 1 | 2 | 3 | 4 | 5;
};

type PhotoMilestone = {
  id: string;
  date: Date;
  photo: string;
  titre?: string;
  description?: string;
  typeJalon: string;
};

// ============================================
// CONSTANTS
// ============================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.75;
const CARD_SPACING = 16;
const GRAPH_HEIGHT = 120;
const GRAPH_PADDING = 24;

const MOOD_CONFIG: Record<
  1 | 2 | 3 | 4 | 5,
  { emoji: string; label: string; color: string; auraColor: string }
> = {
  1: {
    emoji: "😢",
    label: "Difficile",
    color: "#ef4444",
    auraColor: "#fecaca",
  },
  2: { emoji: "😐", label: "Mitigé", color: "#f59e0b", auraColor: "#fde68a" },
  3: { emoji: "🙂", label: "OK", color: "#3b82f6", auraColor: "#bfdbfe" },
  4: { emoji: "😄", label: "Content", color: "#22c55e", auraColor: "#bbf7d0" },
  5: {
    emoji: "🥰",
    label: "Rayonnant",
    color: "#ec4899",
    auraColor: "#fbcfe8",
  },
};

const JALON_TYPE_ICONS: Record<string, { icon: string; label: string }> = {
  dent: { icon: "tooth", label: "Première dent" },
  pas: { icon: "shoe-prints", label: "Premiers pas" },
  sourire: { icon: "face-smile", label: "Premier sourire" },
  mot: { icon: "comment-dots", label: "Premiers mots" },
  photo: { icon: "camera", label: "Moment photo" },
  autre: { icon: "star", label: "Moment spécial" },
};

// ============================================
// HELPERS
// ============================================

const toDate = (value: any): Date => {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatDateShort = (date: Date) =>
  date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const isToday = (date: Date) => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

const getAverageForDay = (moods: MoodEntry[], dayDate: Date): number | null => {
  const dayMoods = moods.filter((m) => {
    const d = m.date;
    return (
      d.getDate() === dayDate.getDate() &&
      d.getMonth() === dayDate.getMonth() &&
      d.getFullYear() === dayDate.getFullYear()
    );
  });
  if (dayMoods.length === 0) return null;
  const sum = dayMoods.reduce((acc, m) => acc + m.humeur, 0);
  return sum / dayMoods.length;
};

// ============================================
// ANIMATED COMPONENTS
// ============================================

const AnimatedGradient = Animated.createAnimatedComponent(ExpoLinearGradient);

const withAlpha = (hex: string, alpha: number) => {
  const safeHex = hex.replace("#", "");
  if (safeHex.length !== 6) return hex;
  const r = parseInt(safeHex.slice(0, 2), 16);
  const g = parseInt(safeHex.slice(2, 4), 16);
  const b = parseInt(safeHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ============================================
// MOOD GRAPH COMPONENT
// ============================================

const MoodGraph = ({ moods }: { moods: MoodEntry[] }) => {
  const font = useFont(
    require("../../../../assets/fonts/SpaceMono-Regular.ttf"),
    12,
  );

  // Get last 7 days
  const days = useMemo(() => {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      result.push(d);
    }
    return result;
  }, []);

  const dataPoints = useMemo(() => {
    return days.map((day) => ({
      date: day,
      value: getAverageForDay(moods, day),
    }));
  }, [days, moods]);

  const graphWidth = SCREEN_WIDTH - GRAPH_PADDING * 2;
  const graphInnerWidth = graphWidth - 40;
  const graphInnerHeight = GRAPH_HEIGHT - 40;

  // Build path
  const path = useMemo(() => {
    const skPath = Skia.Path.Make();
    let started = false;

    dataPoints.forEach((point, index) => {
      if (point.value === null) return;

      const x = 20 + (index / (dataPoints.length - 1)) * graphInnerWidth;
      const y =
        20 + graphInnerHeight - ((point.value - 1) / 4) * graphInnerHeight;

      if (!started) {
        skPath.moveTo(x, y);
        started = true;
      } else {
        skPath.lineTo(x, y);
      }
    });

    return skPath;
  }, [dataPoints, graphInnerWidth, graphInnerHeight]);

  // Animated progress
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  if (!font) return null;

  return (
    <View style={styles.graphContainer}>
      <Text style={styles.graphTitle}>Humeur cette semaine</Text>
      <Canvas style={{ width: graphWidth, height: GRAPH_HEIGHT }}>
        {/* Background grid */}
        {[1, 2, 3, 4, 5].map((level) => {
          const y =
            20 + graphInnerHeight - ((level - 1) / 4) * graphInnerHeight;
          return (
            <Group key={level}>
              <Path
                path={`M 20 ${y} L ${graphWidth - 20} ${y}`}
                style="stroke"
                strokeWidth={1}
                color="#e5e7eb"
              />
              <SkiaText
                x={5}
                y={y + 4}
                text={MOOD_CONFIG[level as 1 | 2 | 3 | 4 | 5].emoji}
                font={font}
                color="#9ca3af"
              />
            </Group>
          );
        })}

        {/* Mood line with gradient */}
        <Path
          path={path}
          style="stroke"
          strokeWidth={3}
          strokeCap="round"
          strokeJoin="round"
        >
          <LinearGradient
            start={vec(20, 0)}
            end={vec(graphWidth - 20, 0)}
            colors={["#ec4899", "#8b5cf6", "#3b82f6"]}
          />
        </Path>

        {/* Data points */}
        {dataPoints.map((point, index) => {
          if (point.value === null) return null;
          const x = 20 + (index / (dataPoints.length - 1)) * graphInnerWidth;
          const y =
            20 + graphInnerHeight - ((point.value - 1) / 4) * graphInnerHeight;
          const moodValue = Math.round(point.value) as 1 | 2 | 3 | 4 | 5;
          return (
            <Circle
              key={index}
              cx={x}
              cy={y}
              r={6}
              color={MOOD_CONFIG[moodValue].color}
            />
          );
        })}
      </Canvas>

      {/* Day labels */}
      <View style={styles.dayLabelsContainer}>
        {days.map((day, index) => (
          <Text key={index} style={styles.dayLabel}>
            {isToday(day)
              ? "Auj."
              : day
                  .toLocaleDateString("fr-FR", { weekday: "short" })
                  .slice(0, 3)}
          </Text>
        ))}
      </View>
    </View>
  );
};

// ============================================
// PHOTO CAROUSEL
// ============================================

const PhotoCarousel = ({
  photos,
  onPhotoPress,
  onPhotoLongPress,
}: {
  photos: PhotoMilestone[];
  onPhotoPress: (photo: PhotoMilestone) => void;
  onPhotoLongPress: (photo: PhotoMilestone) => void;
}) => {
  const renderPhoto = ({
    item,
    index,
  }: {
    item: PhotoMilestone;
    index: number;
  }) => {
    const config = JALON_TYPE_ICONS[item.typeJalon] || JALON_TYPE_ICONS.autre;

    return (
      <Animated.View
        entering={FadeInUp.delay(index * 100).springify()}
        style={styles.photoCard}
      >
        <Pressable
          onPress={() => onPhotoPress(item)}
          onLongPress={() => onPhotoLongPress(item)}
          delayLongPress={400}
          style={({ pressed }) => [
            styles.photoCardInner,
            pressed && styles.photoCardPressed,
          ]}
        >
          <Image source={{ uri: item.photo }} style={styles.photoImage} />
          <View style={styles.photoOverlay}>
            <View style={styles.photoTypeTag}>
              <FontAwesome6 name={config.icon} size={12} color="#fff" />
              <Text style={styles.photoTypeText}>{config.label}</Text>
            </View>
            {item.titre && (
              <Text style={styles.photoTitle} numberOfLines={1}>
                {item.titre}
              </Text>
            )}
            <Text style={styles.photoDate}>
              {formatDateShort(item.date)} - {formatTime(item.date)}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  if (photos.length === 0) {
    return (
      <View style={styles.emptyPhotosContainer}>
        <FontAwesome6 name="images" size={40} color="#d1d5db" />
        <Text style={styles.emptyPhotosText}>Aucun moment photo</Text>
        <Pressable
          style={styles.addPhotoButton}
          onPress={() =>
            router.push("/baby/milestones?openModal=true&type=photo")
          }
        >
          <FontAwesome6 name="plus" size={14} color="#fff" />
          <Text style={styles.addPhotoButtonText}>Ajouter un moment</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.carouselContainer}>
      <View style={styles.carouselHeader}>
        <Text style={styles.sectionTitle}>Moments photos</Text>
        <Pressable
          onPress={() => router.push("/baby/milestones")}
          style={styles.seeAllButton}
        >
          <Text style={styles.seeAllText}>Voir tout</Text>
          <FontAwesome6
            name="chevron-right"
            size={12}
            color={eventColors.jalon.dark}
          />
        </Pressable>
      </View>
      <FlatList
        data={photos}
        renderItem={renderPhoto}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        decelerationRate="fast"
      />
    </View>
  );
};

// ============================================
// TODAY'S MOOD TIMELINE
// ============================================

const TodayMoodTimeline = ({ moods }: { moods: MoodEntry[] }) => {
  const todayMoods = useMemo(() => {
    const today = new Date();
    return moods
      .filter((m) => isToday(m.date))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [moods]);

  if (todayMoods.length === 0) {
    return (
      <View style={styles.timelineEmpty}>
        <Text style={styles.timelineEmptyText}>
          Aucune humeur enregistrée aujourd'hui
        </Text>
        <Pressable
          style={styles.addMoodButton}
          onPress={() =>
            router.push("/baby/milestones?openModal=true&type=humeur")
          }
        >
          <Text style={styles.addMoodButtonText}>Ajouter l'humeur</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.timelineContainer}>
      <Text style={styles.sectionTitle}>Humeurs du jour</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timelineContent}
      >
        {todayMoods.map((mood, index) => (
          <Animated.View
            key={mood.id}
            entering={FadeInDown.delay(index * 80).springify()}
            style={styles.timelineItem}
          >
            <Text style={styles.timelineTime}>{formatTime(mood.date)}</Text>
            <View
              style={[
                styles.timelineDot,
                { backgroundColor: MOOD_CONFIG[mood.humeur].color },
              ]}
            >
              <Text style={styles.timelineEmoji}>
                {MOOD_CONFIG[mood.humeur].emoji}
              </Text>
            </View>
            <Text style={styles.timelineLabel}>
              {MOOD_CONFIG[mood.humeur].label}
            </Text>
            {index < todayMoods.length - 1 && (
              <View style={styles.timelineConnector} />
            )}
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function MomentsScreen() {
  const { activeChild } = useBaby();
  const { setHeaderLeft } = useHeaderLeft();
  const colorScheme = useColorScheme() ?? "light";
  const navigation = useNavigation();
  const headerOwnerId = useRef(
    `moments-${Math.random().toString(36).slice(2)}`,
  );

  const [events, setEvents] = useState<MilestoneEventWithId[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Data processing
  const { moods, photoMilestones, todayStats, currentMood } = useMemo(() => {
    const moodEntries: MoodEntry[] = [];
    const photos: PhotoMilestone[] = [];
    const today = new Date();
    let todayJalons = 0;
    let todayPhotos = 0;
    let latestMood: MoodEntry | null = null;

    events.forEach((event) => {
      const eventDate = toDate(event.date);

      // Moods
      if (event.typeJalon === "humeur" && event.humeur) {
        const entry: MoodEntry = {
          id: event.id,
          date: eventDate,
          humeur: event.humeur as 1 | 2 | 3 | 4 | 5,
        };
        moodEntries.push(entry);
        if (!latestMood || eventDate > latestMood.date) {
          latestMood = entry;
        }
      }

      // Photos
      if (event.photos && event.photos.length > 0) {
        photos.push({
          id: event.id,
          date: eventDate,
          photo: event.photos[0],
          titre: event.titre,
          description: event.description,
          typeJalon: event.typeJalon,
        });
      }

      // Today stats
      if (isToday(eventDate)) {
        todayJalons++;
        if (event.photos && event.photos.length > 0) {
          todayPhotos++;
        }
      }
    });

    return {
      moods: moodEntries,
      photoMilestones: photos
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 10),
      todayStats: { jalons: todayJalons, photos: todayPhotos },
      currentMood: latestMood,
    };
  }, [events]);

  // Header setup
  useFocusEffect(
    useCallback(() => {
      const backButton = (
        <HeaderBackButton
          onPress={() => router.replace("/baby/plus")}
          tintColor={Colors[colorScheme].text}
          labelVisible={false}
        />
      );
      setHeaderLeft(backButton, headerOwnerId.current);
      return () => {
        setHeaderLeft(null, headerOwnerId.current);
      };
    }, [colorScheme, setHeaderLeft]),
  );

  // Data loading
  useEffect(() => {
    if (!activeChild?.id) return;

    // Load last 30 days of milestones
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);

    const unsubscribe = ecouterJalonsHybrid(
      activeChild.id,
      (data) => {
        setEvents(data as MilestoneEventWithId[]);
        setLoaded(true);
      },
      { waitForServer: true, depuis: startDate, jusqu: endDate },
    );

    return () => unsubscribe();
  }, [activeChild?.id]);

  const [viewingPhoto, setViewingPhoto] = useState<PhotoMilestone | null>(null);

  // Tap simple = agrandir la photo
  const handlePhotoPress = useCallback((photo: PhotoMilestone) => {
    setViewingPhoto(photo);
  }, []);

  // Long press = éditer
  const handlePhotoLongPress = useCallback((photo: PhotoMilestone) => {
    router.push(`/baby/milestones?editId=${photo.id}&returnTo=moments`);
  }, []);

  const moodColor = useMemo(
    () =>
      currentMood
        ? MOOD_CONFIG[currentMood.humeur].auraColor
        : eventColors.jalon.light,
    [currentMood],
  );
  const moodAccent = useMemo(
    () =>
      currentMood
        ? MOOD_CONFIG[currentMood.humeur].color
        : eventColors.jalon.dark,
    [currentMood],
  );

  // Memoize particle colors to avoid recalculating on every render
  const particleColors = useMemo(
    () => ({
      blob1: withAlpha(moodAccent, 0.18),
      blob2: withAlpha(moodAccent, 0.16),
      particle1: withAlpha(moodAccent, 0.45),
      particle2: withAlpha(moodAccent, 0.35),
      particle3: withAlpha(moodAccent, 0.4),
      particle4: withAlpha(moodAccent, 0.3),
    }),
    [moodAccent],
  );
  const moodProgress = useSharedValue(0);
  const prevMoodRef = useRef(moodAccent);
  const lastMoodRef = useRef(moodAccent);
  const [sparkleSeed, setSparkleSeed] = useState(0);

  useEffect(() => {
    prevMoodRef.current = lastMoodRef.current;
    lastMoodRef.current = moodAccent;
    moodProgress.value = 0;
    moodProgress.value = withTiming(1, { duration: 900 });
    setSparkleSeed((prev) => prev + 1);
  }, [moodAccent, moodProgress]);

  const gradientOldStyle = useAnimatedStyle(() => ({
    opacity: 1 - moodProgress.value,
  }));
  const gradientNewStyle = useAnimatedStyle(() => ({
    opacity: moodProgress.value,
  }));

  // Loading state
  if (!loaded) {
    return (
      <View style={styles.loadingContainer}>
        <IconPulseDots color={eventColors.jalon.dark} />
        <Text style={styles.loadingText}>Chargement des moments…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Animated Header with Mood Aura */}
          <Animated.View
            entering={FadeIn.duration(600)}
            style={styles.headerSection}
          >
            <MoodBackdrop primary={moodColor} secondary={moodAccent} />
            <View style={styles.gradientOverlay} pointerEvents="none">
              <Animated.View style={[styles.gradientLayer, gradientOldStyle]}>
                <AnimatedGradient
                  colors={[
                    withAlpha(prevMoodRef.current, 0.18),
                    withAlpha(prevMoodRef.current, 0.08),
                    "transparent",
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradientFill}
                />
              </Animated.View>
              <Animated.View style={[styles.gradientLayer, gradientNewStyle]}>
                <AnimatedGradient
                  colors={[
                    withAlpha(moodAccent, 0.2),
                    withAlpha(moodAccent, 0.08),
                    "transparent",
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradientFill}
                />
              </Animated.View>
            </View>

            <View style={styles.particlesLayer} pointerEvents="none">
              <FloatingBlob
                size={160}
                x={SCREEN_WIDTH * 0.05}
                y={-20}
                color={particleColors.blob1}
                delay={400}
              />
              <FloatingBlob
                size={120}
                x={SCREEN_WIDTH * 0.6}
                y={20}
                color={particleColors.blob2}
                delay={900}
              />
              <FloatingParticle
                size={8}
                x={SCREEN_WIDTH * 0.15}
                y={24}
                color={particleColors.particle1}
                delay={200}
                duration={4200}
              />
              <FloatingParticle
                size={6}
                x={SCREEN_WIDTH * 0.35}
                y={160}
                color={particleColors.particle2}
                delay={800}
                duration={3600}
              />
              <FloatingParticle
                size={10}
                x={SCREEN_WIDTH * 0.78}
                y={70}
                color={particleColors.particle3}
                delay={500}
                duration={4800}
              />
              <FloatingParticle
                size={5}
                x={SCREEN_WIDTH * 0.62}
                y={190}
                color={particleColors.particle4}
                delay={1200}
                duration={5200}
              />
            </View>
            <View style={styles.moodHeaderContainer}>
              {currentMood && (
                <View style={styles.auraWrapper}>
                  <PulsingAura
                    color={MOOD_CONFIG[currentMood.humeur].auraColor}
                    size={80}
                  />
                  <View style={styles.emojiCentered}>
                    <AnimatedMoodEmoji mood={currentMood.humeur} />
                  </View>
                  <SparkleBurst key={sparkleSeed} color={moodAccent} />
                </View>
              )}
              <View style={styles.moodDisplay}>
                {currentMood ? (
                  <>
                    <Text style={styles.moodStatusLabel}>
                      {MOOD_CONFIG[currentMood.humeur].label}
                    </Text>
                    <Text style={styles.moodStatusTime}>
                      À {formatTime(currentMood.date)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.noMoodEmoji}>🌟</Text>
                    <Text style={styles.noMoodText}>Comment va bébé ?</Text>
                    <Pressable
                      style={styles.setMoodButton}
                      onPress={() =>
                        router.push(
                          "/baby/milestones?openModal=true&type=humeur&returnTo=moments",
                        )
                      }
                    >
                      <Text style={styles.setMoodButtonText}>
                        Enregistrer l'humeur
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Today Stats */}
          <Animated.View
            entering={FadeInUp.delay(200).springify()}
            style={styles.statsSection}
          >
            <Text style={styles.sectionTitle}>Aujourd'hui</Text>
            <View style={styles.statsRow}>
              <AnimatedCounter
                value={todayStats.jalons}
                label="Jalons"
                color={eventColors.jalon.dark}
                icon="star"
                delay={300}
              />
              <AnimatedCounter
                value={todayStats.photos}
                label="Photos"
                color="#8b5cf6"
                icon="camera"
                delay={400}
              />
              <AnimatedCounter
                value={moods.filter((m) => isToday(m.date)).length}
                label="Humeurs"
                color="#3b82f6"
                icon="heart"
                delay={500}
              />
            </View>
          </Animated.View>

          {/* Today's Mood Timeline */}
          <Animated.View entering={FadeInUp.delay(400).springify()}>
            <TodayMoodTimeline moods={moods} />
          </Animated.View>

          {/* Mood Graph */}
          <Animated.View entering={FadeInUp.delay(600).springify()}>
            <MoodGraph moods={moods} />
          </Animated.View>

          {/* Photo Carousel */}
          <Animated.View entering={FadeInUp.delay(800).springify()}>
            <PhotoCarousel
              photos={photoMilestones}
              onPhotoPress={handlePhotoPress}
              onPhotoLongPress={handlePhotoLongPress}
            />
          </Animated.View>

          {/* Quick Actions */}
          <Animated.View
            entering={FadeInUp.delay(1000).springify()}
            style={styles.quickActionsSection}
          >
            <Text style={styles.sectionTitle}>Actions rapides</Text>
            <View style={styles.quickActionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.quickActionButton,
                  pressed && styles.quickActionPressed,
                ]}
                onPress={() =>
                  router.push(
                    "/baby/milestones?openModal=true&type=humeur&returnTo=moments",
                  )
                }
              >
                <View
                  style={[
                    styles.quickActionIcon,
                    { backgroundColor: "#fce7f3" },
                  ]}
                >
                  <FontAwesome6 name="heart" size={20} color="#ec4899" />
                </View>
                <Text style={styles.quickActionLabel}>Humeur</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.quickActionButton,
                  pressed && styles.quickActionPressed,
                ]}
                onPress={() =>
                  router.push(
                    "/baby/milestones?openModal=true&type=photo&returnTo=moments",
                  )
                }
              >
                <View
                  style={[
                    styles.quickActionIcon,
                    { backgroundColor: "#ede9fe" },
                  ]}
                >
                  <FontAwesome6 name="camera" size={20} color="#8b5cf6" />
                </View>
                <Text style={styles.quickActionLabel}>Photo</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.quickActionButton,
                  pressed && styles.quickActionPressed,
                ]}
                onPress={() =>
                  router.push(
                    "/baby/milestones?openModal=true&returnTo=moments",
                  )
                }
              >
                <View
                  style={[
                    styles.quickActionIcon,
                    { backgroundColor: eventColors.jalon.light },
                  ]}
                >
                  <FontAwesome6
                    name="star"
                    size={20}
                    color={eventColors.jalon.dark}
                  />
                </View>
                <Text style={styles.quickActionLabel}>Jalon</Text>
              </Pressable>
            </View>
          </Animated.View>

          {/* Bottom padding */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Photo Viewer Modal */}
      <Modal
        visible={viewingPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingPhoto(null)}
      >
        <Pressable
          style={styles.photoViewerOverlay}
          onPress={() => setViewingPhoto(null)}
        >
          <SafeAreaView style={styles.photoViewerContainer}>
            {viewingPhoto && (
              <>
                <View style={styles.photoViewerHeader}>
                  <Pressable
                    style={styles.photoViewerClose}
                    onPress={() => setViewingPhoto(null)}
                  >
                    <FontAwesome6 name="xmark" size={24} color="#fff" />
                  </Pressable>
                  <Pressable
                    style={styles.photoViewerEdit}
                    onPress={() => {
                      setViewingPhoto(null);
                      router.push(
                        `/baby/milestones?editId=${viewingPhoto.id}&returnTo=moments`,
                      );
                    }}
                  >
                    <FontAwesome6 name="pen" size={18} color="#fff" />
                    <Text style={styles.photoViewerEditText}>Modifier</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={styles.photoViewerImageContainer}
                  onPress={(e) => e.stopPropagation()}
                >
                  <Image
                    source={{ uri: viewingPhoto.photo }}
                    style={styles.photoViewerImage}
                    resizeMode="contain"
                  />
                </Pressable>
                <View style={styles.photoViewerInfo}>
                  {viewingPhoto.titre && (
                    <Text style={styles.photoViewerTitle}>
                      {viewingPhoto.titre}
                    </Text>
                  )}
                  <Text style={styles.photoViewerDate}>
                    {formatDateShort(viewingPhoto.date)} à{" "}
                    {formatTime(viewingPhoto.date)}
                  </Text>
                </View>
              </>
            )}
          </SafeAreaView>
        </Pressable>
      </Modal>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#faf9fb",
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#faf9fb",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6b7280",
  },

  // Header with Mood
  headerSection: {
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  moodBackdropCanvas: {
    position: "absolute",
    top: -20,
    left: 0,
    width: SCREEN_WIDTH,
    height: 240,
  },
  gradientOverlay: {
    position: "absolute",
    top: -10,
    left: 0,
    width: SCREEN_WIDTH,
    height: 240,
  },
  gradientLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientFill: {
    width: "100%",
    height: "100%",
  },
  moodHeaderContainer: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 180,
  },
  auraWrapper: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  auraContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  particlesLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 240,
  },
  particle: {
    position: "absolute",
    borderRadius: 999,
  },
  floatingBlob: {
    position: "absolute",
    borderRadius: 999,
  },
  auraCircle: {
    position: "absolute",
    borderRadius: 999,
  },
  emojiCentered: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  moodDisplay: {
    alignItems: "center",
    zIndex: 10,
  },
  moodEmojiLarge: {
    fontSize: 64,
  },
  moodStatusLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 4,
  },
  moodStatusTime: {
    fontSize: 13,
    color: "#9ca3af",
  },
  noMoodEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  noMoodText: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 12,
  },
  setMoodButton: {
    backgroundColor: eventColors.jalon.dark,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  setMoodButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  sparkleBurst: {
    position: "absolute",
    right: -10,
    top: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkleLine: {
    height: 3,
    borderRadius: 999,
  },
  sparkleLineAlt: {
    marginTop: 12,
    transform: [{ rotate: "45deg" }],
  },
  sparkleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },

  // Stats Section
  statsSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
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
    color: "#6b7280",
    marginTop: 2,
  },

  // Timeline
  timelineContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  timelineContent: {
    paddingRight: 16,
    gap: 0,
  },
  timelineItem: {
    alignItems: "center",
    marginRight: 24,
    position: "relative",
  },
  timelineTime: {
    fontSize: 11,
    color: "#9ca3af",
    marginBottom: 6,
  },
  timelineDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  timelineEmoji: {
    fontSize: 22,
  },
  timelineLabel: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "500",
  },
  timelineConnector: {
    position: "absolute",
    right: -16,
    top: 30,
    width: 16,
    height: 2,
    backgroundColor: "#e5e7eb",
  },
  timelineEmpty: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: "center",
    marginBottom: 24,
  },
  timelineEmptyText: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 12,
  },
  addMoodButton: {
    backgroundColor: eventColors.jalon.dark,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  addMoodButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  // Graph
  graphContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
    backgroundColor: "#fff",
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  graphTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  dayLabelsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 8,
  },
  dayLabel: {
    fontSize: 11,
    color: "#9ca3af",
    textTransform: "capitalize",
  },

  // Carousel
  carouselContainer: {
    marginBottom: 24,
  },
  carouselHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeAllText: {
    fontSize: 13,
    color: eventColors.jalon.dark,
    fontWeight: "600",
  },
  carouselContent: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 8,
  },
  photoCard: {
    width: CARD_WIDTH,
    marginRight: CARD_SPACING,
  },
  photoCardInner: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  photoCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  photoImage: {
    width: "100%",
    height: 200,
    backgroundColor: "#f3f4f6",
  },
  photoOverlay: {
    padding: 16,
  },
  photoTypeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: eventColors.jalon.dark,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  photoTypeText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "600",
  },
  photoTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  photoDate: {
    fontSize: 12,
    color: "#9ca3af",
  },
  emptyPhotosContainer: {
    alignItems: "center",
    paddingVertical: 40,
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    marginBottom: 24,
  },
  emptyPhotosText: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 12,
    marginBottom: 16,
  },
  addPhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: eventColors.jalon.dark,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  addPhotoButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  // Quick Actions
  quickActionsSection: {
    paddingHorizontal: 16,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },

  // Photo Viewer Modal
  photoViewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  },
  photoViewerContainer: {
    flex: 1,
    justifyContent: "space-between",
  },
  photoViewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  photoViewerClose: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  photoViewerEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  photoViewerEditText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  photoViewerImageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  photoViewerImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  photoViewerInfo: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  photoViewerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
    textAlign: "center",
  },
  photoViewerDate: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
  },
});
