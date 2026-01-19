import { ThemedView } from "@/components/themed-view";
import { InfoModal } from "@/components/ui/InfoModal";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterEvenements,
  type Event,
  type EventType,
} from "@/services/eventsService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ============================================
// TYPES
// ============================================

type RangeOption = 7 | 14 | 30;
type FilterType = "meals" | "pumping" | "immunos" | "diapers";

type TimelineSection = {
  title: string;
  key: string;
  data: Event[];
};

// ============================================
// CENTRALIZED CONFIGS
// ============================================

const STORAGE_KEY = "chrono_filters_v1";

const EVENT_CONFIG: Record<
  EventType,
  {
    color: string;
    label: string;
    short: string;
    icon: { lib: "fa6" | "mci"; name: string };
  }
> = {
  biberon: {
    color: "#FF5722",
    label: "Biberon",
    short: "Bib",
    icon: { lib: "mci", name: "baby-bottle" },
  },
  tetee: {
    color: "#E91E63",
    label: "Tétée",
    short: "Tétée",
    icon: { lib: "fa6", name: "person-breastfeeding" },
  },
  pompage: {
    color: "#28a745",
    label: "Pompage",
    short: "Pompe",
    icon: { lib: "fa6", name: "pump-medical" },
  },
  couche: {
    color: "#4A90E2",
    label: "Couche",
    short: "Couche",
    icon: { lib: "fa6", name: "baby" },
  },
  miction: {
    color: "#17a2b8",
    label: "Miction",
    short: "Pipi",
    icon: { lib: "fa6", name: "water" },
  },
  selle: {
    color: "#dc3545",
    label: "Selle",
    short: "Popo",
    icon: { lib: "fa6", name: "poop" },
  },
  sommeil: {
    color: "#6f42c1",
    label: "Sommeil",
    short: "Sommeil",
    icon: { lib: "fa6", name: "bed" },
  },
  vaccin: {
    color: "#9C27B0",
    label: "Vaccin",
    short: "Vaccin",
    icon: { lib: "fa6", name: "syringe" },
  },
  vitamine: {
    color: "#FF9800",
    label: "Vitamine",
    short: "Vitamine",
    icon: { lib: "fa6", name: "pills" },
  },
};

const FILTER_CONFIG: Record<
  FilterType,
  {
    label: string;
    icon: string;
    color: string;
    eventTypes: EventType[];
  }
> = {
  meals: {
    label: "Repas",
    icon: "baby",
    color: "#4A90E2",
    eventTypes: ["tetee", "biberon"],
  },
  pumping: {
    label: "Tire-lait",
    icon: "pump-medical",
    color: "#28a745",
    eventTypes: ["pompage"],
  },
  immunos: {
    label: "Immunos",
    icon: "prescription-bottle",
    color: "#9C27B0",
    eventTypes: ["vitamine", "vaccin"],
  },
  diapers: {
    label: "Pipi popo",
    icon: "toilet",
    color: "#17a2b8",
    eventTypes: ["miction", "selle"],
  },
};

const ALL_FILTERS: FilterType[] = ["meals", "pumping", "immunos", "diapers"];
const RANGE_OPTIONS: RangeOption[] = [7, 14, 30];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function toDate(value: any): Date {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(date: Date) {
  const today = startOfDay(new Date()).getTime();
  const target = startOfDay(date).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (target === today) return "Aujourd'hui";
  if (target === today - dayMs) return "Hier";
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function buildSections(events: Event[]): TimelineSection[] {
  const grouped = new Map<string, { date: Date; items: Event[] }>();
  events.forEach((event) => {
    const date = toDate(event.date);
    const key = date.toISOString().slice(0, 10);
    if (!grouped.has(key)) {
      grouped.set(key, { date, items: [] });
    }
    grouped.get(key)!.items.push(event);
  });

  return Array.from(grouped.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, value]) => ({
      key,
      title: formatDayLabel(value.date),
      data: value.items.sort(
        (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime(),
      ),
    }));
}

function buildDetails(event: Event) {
  switch (event.type) {
    case "biberon":
      return event.quantite ? `${event.quantite} ml` : undefined;
    case "tetee": {
      const left = event.dureeGauche ? `G ${event.dureeGauche}m` : null;
      const right = event.dureeDroite ? `D ${event.dureeDroite}m` : null;
      const parts = [left, right].filter(Boolean);
      return parts.length > 0 ? parts.join(" • ") : undefined;
    }
    case "pompage": {
      const left = event.quantiteGauche ? `G ${event.quantiteGauche} ml` : null;
      const right = event.quantiteDroite
        ? `D ${event.quantiteDroite} ml`
        : null;
      const parts = [left, right].filter(Boolean);
      return parts.length > 0 ? parts.join(" • ") : undefined;
    }
    case "miction":
      return event.volume ? `${event.volume} ml` : event.couleur;
    case "selle":
      return event.consistance || event.couleur;
    case "sommeil":
      return event.duree ? `${Math.round(event.duree)} min` : undefined;
    case "vaccin":
      return event.nomVaccin;
    case "vitamine":
      return event.nomVitamine || event.dosage;
    default:
      return undefined;
  }
}

function buildCounts(events: Event[]) {
  const counts = new Map<EventType, number>();
  events.forEach((event) => {
    counts.set(event.type, (counts.get(event.type) || 0) + 1);
  });
  return counts;
}

function orderCounts(counts: Map<EventType, number>) {
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function getEditRoute(event: Event): string | null {
  if (!event.id) return null;
  const id = encodeURIComponent(event.id);
  switch (event.type) {
    case "tetee":
      return `/baby/meals?tab=seins&editId=${id}&returnTo=chrono`;
    case "biberon":
      return `/baby/meals?tab=biberons&editId=${id}&returnTo=chrono`;
    case "pompage":
      return `/baby/pumping?editId=${id}&returnTo=chrono`;
    case "miction":
      return `/baby/diapers?tab=mictions&editId=${id}&returnTo=chrono`;
    case "selle":
      return `/baby/diapers?tab=selles&editId=${id}&returnTo=chrono`;
    case "vaccin":
      return `/baby/immunizations?tab=vaccins&editId=${id}&returnTo=chrono`;
    case "vitamine":
      return `/baby/immunizations?tab=vitamines&editId=${id}&returnTo=chrono`;
    default:
      return null;
  }
}

// ============================================
// EXTRACTED COMPONENTS
// ============================================

interface EventIconProps {
  type: EventType;
  color: string;
  size: number;
}

const EventIcon = React.memo(({ type, color, size }: EventIconProps) => {
  const iconConfig = EVENT_CONFIG[type].icon;
  if (iconConfig.lib === "mci") {
    return (
      <MaterialCommunityIcons
        name={iconConfig.name as any}
        size={size}
        color={color}
      />
    );
  }
  return (
    <FontAwesome name={iconConfig.name as any} size={size} color={color} />
  );
});
EventIcon.displayName = "EventIcon";

interface FilterChipProps {
  type: FilterType;
  isActive: boolean;
  borderColor: string;
  tintColor: string;
  backgroundColor: string;
  textColor: string;
  onPress: () => void;
}

const FilterChip = React.memo(
  ({
    type,
    isActive,
    borderColor,
    tintColor,
    backgroundColor,
    textColor,
    onPress,
  }: FilterChipProps) => {
    const config = FILTER_CONFIG[type];
    return (
      <TouchableOpacity
        style={[
          styles.filterChip,
          { borderColor },
          isActive && { backgroundColor: tintColor },
        ]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <FontAwesome
          name={config.icon as any}
          size={12}
          color={isActive ? backgroundColor : config.color}
        />
        <Text
          style={[
            styles.filterChipText,
            { color: isActive ? backgroundColor : textColor },
          ]}
        >
          {config.label}
        </Text>
      </TouchableOpacity>
    );
  },
);
FilterChip.displayName = "FilterChip";

interface RangeChipProps {
  value: RangeOption;
  isActive: boolean;
  borderColor: string;
  tintColor: string;
  backgroundColor: string;
  textColor: string;
  onPress: () => void;
}

const RangeChip = React.memo(
  ({
    value,
    isActive,
    borderColor,
    tintColor,
    backgroundColor,
    textColor,
    onPress,
  }: RangeChipProps) => (
    <TouchableOpacity
      style={[
        styles.rangeChip,
        { borderColor },
        isActive && { backgroundColor: tintColor },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text
        style={[
          styles.rangeChipText,
          { color: isActive ? backgroundColor : textColor },
        ]}
      >
        {value}j
      </Text>
    </TouchableOpacity>
  ),
);
RangeChip.displayName = "RangeChip";

interface DaySummaryProps {
  counts: Map<EventType, number>;
  borderColor: string;
  textColor: string;
}

const DaySummary = React.memo(
  ({ counts, borderColor, textColor }: DaySummaryProps) => {
    const ordered = orderCounts(counts);
    const topTypes = ordered.slice(0, 4);
    const remaining = ordered.slice(4);
    const remainingTotal = remaining.reduce((sum, [, count]) => sum + count, 0);

    return (
      <View style={styles.summaryRow}>
        {topTypes.map(([type, count]) => {
          const config = EVENT_CONFIG[type];
          return (
            <View key={type} style={[styles.summaryPill, { borderColor }]}>
              <EventIcon type={type} color={config.color} size={12} />
              <Text style={[styles.summaryText, { color: textColor }]}>
                {config.short} {count}
              </Text>
            </View>
          );
        })}
        {remainingTotal > 0 && (
          <View style={[styles.summaryPill, { borderColor }]}>
            <Text style={[styles.summaryText, { color: textColor }]}>
              +{remainingTotal}
            </Text>
          </View>
        )}
      </View>
    );
  },
);
DaySummary.displayName = "DaySummary";

interface SectionHeaderProps {
  title: string;
  count: number;
  counts: Map<EventType, number>;
  borderColor: string;
  textColor: string;
}

const SectionHeader = React.memo(
  ({ title, count, counts, borderColor, textColor }: SectionHeaderProps) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
        <View style={[styles.countBadge, { borderColor }]}>
          <Text style={[styles.countText, { color: textColor }]}>{count}</Text>
        </View>
      </View>
      <DaySummary
        counts={counts}
        borderColor={borderColor}
        textColor={textColor}
      />
    </View>
  ),
);
SectionHeader.displayName = "SectionHeader";

interface TimelineCardProps {
  event: Event;
  borderColor: string;
  backgroundColor: string;
  textColor: string;
  secondaryTextColor: string;
  onLongPress: () => void;
}

const TimelineCard = React.memo(
  ({
    event,
    borderColor,
    backgroundColor,
    textColor,
    secondaryTextColor,
    onLongPress,
  }: TimelineCardProps) => {
    const date = toDate(event.date);
    const details = buildDetails(event);
    const config = EVENT_CONFIG[event.type];

    return (
      <View style={styles.itemRow}>
        <View style={styles.timelineColumn}>
          <View style={[styles.dot, { backgroundColor: config.color }]} />
          <View style={[styles.line, { backgroundColor: borderColor }]} />
        </View>
        <TouchableOpacity
          style={[styles.card, { backgroundColor, borderColor }]}
          activeOpacity={0.9}
          delayLongPress={250}
          onLongPress={onLongPress}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <EventIcon type={event.type} color={config.color} size={14} />
              <Text style={[styles.cardTitle, { color: textColor }]}>
                {config.label}
              </Text>
            </View>
            <Text style={[styles.cardTime, { color: secondaryTextColor }]}>
              {formatTime(date)}
            </Text>
          </View>
          {details && (
            <Text style={[styles.cardDetails, { color: secondaryTextColor }]}>
              {details}
            </Text>
          )}
          {event.note && (
            <View style={[styles.noteContainer, { borderColor }]}>
              <FontAwesome
                name="message"
                size={10}
                color={secondaryTextColor}
              />
              <Text style={[styles.cardNote, { color: textColor }]}>
                {event.note}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  },
);
TimelineCard.displayName = "TimelineCard";

// ============================================
// MAIN COMPONENT
// ============================================

export default function ChronoScreen() {
  const { activeChild } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  const [range, setRange] = useState<RangeOption>(14);
  const [selectedTypes, setSelectedTypes] = useState<FilterType[]>(ALL_FILTERS);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedPrefs = useRef(false);
  const [infoModalMessage, setInfoModalMessage] = useState<string | null>(null);

  // Fade animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Theme colors
  const colors = useMemo(
    () => ({
      text: Colors[colorScheme].text,
      background: Colors[colorScheme].background,
      tint: Colors[colorScheme].tint,
      secondary: Colors[colorScheme].tabIconDefault,
      border: `${Colors[colorScheme].tabIconDefault}20`,
    }),
    [colorScheme],
  );

  // Load events
  useEffect(() => {
    if (!activeChild?.id) return;

    setLoading(true);
    fadeAnim.setValue(0);

    const since = startOfDay(new Date());
    since.setDate(since.getDate() - (range - 1));

    const unsubscribe = ecouterEvenements(
      activeChild.id,
      (data) => {
        setEvents(data);
        setLoading(false);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      },
      { depuis: since, waitForServer: true },
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChild?.id, range]);

  // Reset on child change
  useEffect(() => {
    if (!activeChild?.id) return;
    setEvents([]);
    setLoading(true);
  }, [activeChild?.id]);

  // Load preferences
  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;

    const loadPrefs = async () => {
      try {
        const raw = await AsyncStorage.getItem(
          `${STORAGE_KEY}:${activeChild.id}`,
        );
        if (!raw || cancelled) {
          hasLoadedPrefs.current = true;
          return;
        }
        const parsed = JSON.parse(raw);
        if (parsed?.range) {
          setRange(parsed.range);
        }
        if (Array.isArray(parsed?.selectedTypes)) {
          setSelectedTypes(parsed.selectedTypes);
        }
      } catch {
        // ignore cache errors
      } finally {
        if (!cancelled) {
          hasLoadedPrefs.current = true;
        }
      }
    };

    loadPrefs();

    return () => {
      cancelled = true;
    };
  }, [activeChild?.id]);

  // Save preferences
  useEffect(() => {
    if (!activeChild?.id || !hasLoadedPrefs.current) return;
    const payload = JSON.stringify({ range, selectedTypes });
    AsyncStorage.setItem(`${STORAGE_KEY}:${activeChild.id}`, payload).catch(
      () => {},
    );
  }, [activeChild?.id, range, selectedTypes]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (selectedTypes.length === 0) return [];

    const effectiveTypes = new Set<EventType>();
    selectedTypes.forEach((filter) => {
      FILTER_CONFIG[filter].eventTypes.forEach((type) =>
        effectiveTypes.add(type),
      );
    });

    return events.filter((event) => effectiveTypes.has(event.type));
  }, [events, selectedTypes]);

  // Sections
  const sections = useMemo(
    () => buildSections(filteredEvents),
    [filteredEvents],
  );

  // Handlers with useCallback
  const handleRangeChange = useCallback((value: RangeOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRange(value);
  }, []);

  const handleFilterToggle = useCallback((type: FilterType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((value) => value !== type)
        : [...prev, type],
    );
  }, []);

  const handleEdit = useCallback((event: Event) => {
    const route = getEditRoute(event);
    if (!route) {
      setInfoModalMessage("Cet evenement ne peut pas etre modifie ici.");
      return;
    }
    router.push(route as any);
  }, []);

  const handleEventLongPress = useCallback(
    (event: Event) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      handleEdit(event);
    },
    [handleEdit],
  );

  const closeInfoModal = useCallback(() => {
    setInfoModalMessage(null);
  }, []);

  // Render section header
  const renderSectionHeader = useCallback(
    ({ section }: { section: TimelineSection }) => {
      const counts = buildCounts(section.data);
      return (
        <SectionHeader
          title={section.title}
          count={section.data.length}
          counts={counts}
          borderColor={colors.border}
          textColor={colors.text}
        />
      );
    },
    [colors.border, colors.text],
  );

  // Render item
  const renderItem = useCallback(
    ({ item }: { item: Event }) => (
      <TimelineCard
        event={item}
        borderColor={colors.border}
        backgroundColor={colors.background}
        textColor={colors.text}
        secondaryTextColor={colors.secondary}
        onLongPress={() => handleEventLongPress(item)}
      />
    ),
    [colors, handleEventLongPress],
  );

  // Key extractor
  const keyExtractor = useCallback(
    (item: Event) => item.id || `${item.type}-${item.date}`,
    [],
  );

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        {/* Compact Header with Range Selector */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>
              Chronologie
            </Text>
            <View style={styles.rangeRow}>
              {RANGE_OPTIONS.map((value) => (
                <RangeChip
                  key={value}
                  value={value}
                  isActive={range === value}
                  borderColor={colors.border}
                  tintColor={colors.tint}
                  backgroundColor={colors.background}
                  textColor={colors.text}
                  onPress={() => handleRangeChange(value)}
                />
              ))}
            </View>
          </View>
        </View>

        {/* Filter ScrollView */}
        <View style={styles.filterScroll}>
          <View style={styles.filterRow}>
            {ALL_FILTERS.map((type) => (
              <FilterChip
                key={type}
                type={type}
                isActive={selectedTypes.includes(type)}
                borderColor={colors.border}
                tintColor={colors.tint}
                backgroundColor={colors.background}
                textColor={colors.text}
                onPress={() => handleFilterToggle(type)}
              />
            ))}
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={colors.tint} />
              <Text style={[styles.loadingText, { color: colors.secondary }]}>
                Chargement de la timeline...
              </Text>
            </View>
          ) : sections.length === 0 ? (
            <View style={styles.emptyState}>
              <View
                style={[styles.emptyIconCircle, { borderColor: colors.border }]}
              >
                <FontAwesome
                  name="calendar-xmark"
                  size={32}
                  color={colors.secondary}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Aucun événement
              </Text>
              <Text style={[styles.emptyText, { color: colors.secondary }]}>
                {selectedTypes.length === 0
                  ? "Selectionnez au moins un type pour afficher la timeline."
                  : "Aucun evenement pour ces filtres."}
              </Text>
            </View>
          ) : (
            <Animated.View style={[styles.listWrapper, { opacity: fadeAnim }]}>
              <SectionList
                sections={sections}
                keyExtractor={keyExtractor}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                windowSize={7}
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                removeClippedSubviews={true}
                updateCellsBatchingPeriod={50}
                renderSectionHeader={renderSectionHeader}
                renderItem={renderItem}
              />
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
      <InfoModal
        visible={!!infoModalMessage}
        title="Action indisponible"
        message={infoModalMessage ?? ""}
        backgroundColor={colors.background}
        textColor={colors.text}
        onClose={closeInfoModal}
      />
    </ThemedView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
  },
  rangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  rangeChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 6,
    // paddingTop: 4,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  sectionHeader: {
    marginTop: 16,
    marginBottom: 12,
    gap: 6,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  countText: {
    fontSize: 12,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  summaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: "600",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  timelineColumn: {
    width: 20,
    alignItems: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 6,
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  cardTime: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardDetails: {
    marginTop: 6,
    fontSize: 12,
  },
  noteContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  cardNote: {
    flex: 1,
    fontSize: 13,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
  },
});
