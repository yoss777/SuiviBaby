import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterEvenements,
  type Event,
  type EventType,
} from "@/services/eventsService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { InfoModal } from "@/components/ui/InfoModal";

type RangeOption = 7 | 14 | 30;

type TimelineSection = {
  title: string;
  key: string;
  data: Event[];
};

const STORAGE_KEY = "chrono_filters_v1";

const EVENT_COLORS: Record<EventType, string> = {
  biberon: "#FF5722",
  tetee: "#E91E63",
  pompage: "#28a745",
  couche: "#4A90E2",
  miction: "#17a2b8",
  selle: "#dc3545",
  sommeil: "#6f42c1",
  vaccin: "#9C27B0",
  vitamine: "#FF9800",
};

const FILTER_ICON_COLORS: Record<FilterType, string> = {
  meals: "#4A90E2",
  pumping: "#28a745",
  immunos: "#9C27B0",
  diapers: "#17a2b8",
};


const EVENT_LABELS: Record<EventType, string> = {
  biberon: "Biberon",
  tetee: "Tétée",
  pompage: "Pompage",
  couche: "Couche",
  miction: "Miction",
  selle: "Selle",
  sommeil: "Sommeil",
  vaccin: "Vaccin",
  vitamine: "Vitamine",
};

const EVENT_ICONS: Record<EventType, { lib: "fa6" | "mci"; name: string }> = {
  biberon: { lib: "mci", name: "baby-bottle" },
  tetee: { lib: "fa6", name: "person-breastfeeding" },
  pompage: { lib: "fa6", name: "pump-medical" },
  couche: { lib: "fa6", name: "baby" },
  miction: { lib: "fa6", name: "water" },
  selle: { lib: "fa6", name: "poop" },
  sommeil: { lib: "fa6", name: "bed" },
  vaccin: { lib: "fa6", name: "syringe" },
  vitamine: { lib: "fa6", name: "pills" },
};

type FilterType = "meals" | "pumping" | "immunos" | "diapers";

const ALL_TYPES: FilterType[] = ["meals", "pumping", "immunos", "diapers"];

const TYPE_SHORT: Record<EventType, string> = {
  biberon: "Bib",
  tetee: "Tétée",
  pompage: "Pompe",
  couche: "Couche",
  miction: "Pipi",
  selle: "Popo",
  sommeil: "Sommeil",
  vaccin: "Vaccin",
  vitamine: "Vitamine",
};

const FILTER_LABELS: Record<FilterType, string> = {
  meals: "Repas",
  pumping: "Tire-lait",
  immunos: "Immunos",
  diapers: "Pipi popo",
};

const FILTER_ICONS: Record<FilterType, string> = {
  meals: "baby",
  pumping: "pump-medical",
  immunos: "prescription-bottle",
  diapers: "toilet",
};

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

function renderEventIcon(
  type: EventType,
  color: string,
  size: number
): JSX.Element {
  const icon = EVENT_ICONS[type];
  if (icon.lib === "mci") {
    return <MaterialCommunityIcons name={icon.name as any} size={size} color={color} />;
  }
  return <FontAwesome name={icon.name as any} size={size} color={color} />;
}

function getEditRoute(event: Event): string | null {
  if (!event.id) return null;
  const id = encodeURIComponent(event.id);
  switch (event.type) {
    case "tetee":
      return `/baby/meals?tab=seins&editId=${id}`;
    case "biberon":
      return `/baby/meals?tab=biberons&editId=${id}`;
    case "pompage":
      return `/baby/pumping?editId=${id}`;
    case "miction":
      return `/baby/diapers?tab=mictions&editId=${id}`;
    case "selle":
      return `/baby/diapers?tab=selles&editId=${id}`;
    case "vaccin":
      return `/baby/immunizations?tab=vaccins&editId=${id}`;
    case "vitamine":
      return `/baby/immunizations?tab=vitamines&editId=${id}`;
    default:
      return null;
  }
}

export default function ChronoScreen() {
  const { activeChild } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  const { showToast } = useToast();
  const [range, setRange] = useState<RangeOption>(14);
  const [selectedTypes, setSelectedTypes] = useState<FilterType[]>(ALL_TYPES);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const borderColor = `${Colors[colorScheme].tabIconDefault}20`;
  const hasLoadedPrefs = useRef(false);
  const [infoModalMessage, setInfoModalMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeChild?.id) return;

    setLoading(true);
    const since = startOfDay(new Date());
    since.setDate(since.getDate() - (range - 1));

    const unsubscribe = ecouterEvenements(
      activeChild.id,
      (data) => {
        setEvents(data);
        setLoading(false);
      },
      { depuis: since, waitForServer: true },
    );

    return () => unsubscribe();
  }, [activeChild?.id, range]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setEvents([]);
    setLoading(true);
  }, [activeChild?.id]);

  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;

    const loadPrefs = async () => {
      try {
        const raw = await AsyncStorage.getItem(`${STORAGE_KEY}:${activeChild.id}`);
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
      } catch (error) {
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

  useEffect(() => {
    if (!activeChild?.id || !hasLoadedPrefs.current) return;
    const payload = JSON.stringify({ range, selectedTypes });
    AsyncStorage.setItem(`${STORAGE_KEY}:${activeChild.id}`, payload).catch(() => {});
  }, [activeChild?.id, range, selectedTypes]);

  const filteredEvents = useMemo(() => {
    if (selectedTypes.length === 0) return [];

    const effectiveTypes = new Set<EventType>();
    if (selectedTypes.includes("meals")) {
      effectiveTypes.add("tetee");
      effectiveTypes.add("biberon");
    }
    if (selectedTypes.includes("pumping")) {
      effectiveTypes.add("pompage");
    }
    if (selectedTypes.includes("immunos")) {
      effectiveTypes.add("vitamine");
      effectiveTypes.add("vaccin");
    }
    if (selectedTypes.includes("diapers")) {
      effectiveTypes.add("miction");
      effectiveTypes.add("selle");
    }

    return events.filter((event) => effectiveTypes.has(event.type));
  }, [events, selectedTypes]);

  const sections = useMemo(
    () => buildSections(filteredEvents),
    [filteredEvents],
  );

  const handleEdit = (event: Event) => {
    const route = getEditRoute(event);
    if (!route) {
      setInfoModalMessage("Cet evenement ne peut pas etre modifie ici.");
      return;
    }
    router.push(route as any);
  };

  const handleEventLongPress = (event: Event) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleEdit(event);
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: Colors[colorScheme].text }]}>
            Chronologie
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: Colors[colorScheme].tabIconDefault },
            ]}
          >
            Tous les événements regroupés par jour
          </Text>
        </View>

        <View style={styles.rangeRow}>
          {[7, 14, 30].map((value) => {
            const isActive = range === value;
            return (
              <TouchableOpacity
                key={value}
                style={[
                  styles.rangePill,
                  { borderColor },
                  isActive && { backgroundColor: Colors[colorScheme].tint },
                ]}
                onPress={() => setRange(value as RangeOption)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.rangeText,
                    {
                      color: isActive
                        ? Colors[colorScheme].background
                        : Colors[colorScheme].text,
                    },
                  ]}
                >
                  {value}j
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {ALL_TYPES.map((type) => {
            const isActive = selectedTypes.includes(type);
            const iconColor = FILTER_ICON_COLORS[type];
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterPill,
                  { borderColor },
                  isActive && { backgroundColor: Colors[colorScheme].tint },
                ]}
                onPress={() =>
                  setSelectedTypes((prev) =>
                    isActive
                      ? prev.filter((value) => value !== type)
                      : [...prev, type],
                  )
                }
                activeOpacity={0.8}
              >
                <FontAwesome
                  name={FILTER_ICONS[type]}
                  size={12}
                  color={isActive ? Colors[colorScheme].background : iconColor}
                />
                <Text
                  style={[
                    styles.filterText,
                    {
                      color: isActive
                        ? Colors[colorScheme].background
                        : Colors[colorScheme].text,
                    },
                  ]}
                >
                  {FILTER_LABELS[type]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
            <Text
              style={[
                styles.loadingText,
                { color: Colors[colorScheme].tabIconDefault },
              ]}
            >
              Chargement de la timeline...
            </Text>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome
              name="calendar-xmark"
              size={48}
              color={Colors[colorScheme].tabIconDefault}
            />
            <Text
              style={[styles.emptyTitle, { color: Colors[colorScheme].text }]}
            >
              Aucun événement
            </Text>
            <Text
              style={[
                styles.emptyText,
                { color: Colors[colorScheme].tabIconDefault },
              ]}
            >
              {selectedTypes.length === 0
                ? "Selectionnez au moins un type pour afficher la timeline."
                : "Aucun evenement pour ces filtres."}
            </Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id || `${item.type}-${item.date}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section }) => {
              const counts = buildCounts(section.data);
              const ordered = orderCounts(counts);
              const topTypes = ordered.slice(0, 4);
              const remaining = ordered.slice(4);
              const remainingTotal = remaining.reduce(
                (sum, [, count]) => sum + count,
                0,
              );
              return (
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: Colors[colorScheme].text },
                      ]}
                    >
                      {section.title}
                    </Text>
                    <View style={[styles.countBadge, { borderColor }]}>
                      <Text
                        style={[
                          styles.countText,
                          { color: Colors[colorScheme].text },
                        ]}
                      >
                        {section.data.length}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.summaryRow}>
                    {topTypes.map(([type, count]) => (
                      <View
                        key={type}
                        style={[styles.summaryPill, { borderColor }]}
                      >
                        {renderEventIcon(type, EVENT_COLORS[type], 11)}
                        <Text
                          style={[
                            styles.summaryText,
                            { color: Colors[colorScheme].text },
                          ]}
                        >
                          {TYPE_SHORT[type]} {count}
                        </Text>
                      </View>
                    ))}
                    {remainingTotal > 0 ? (
                      <View style={[styles.summaryPill, { borderColor }]}>
                        <Text
                          style={[
                            styles.summaryText,
                            { color: Colors[colorScheme].text },
                          ]}
                        >
                          +{remainingTotal}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            }}
            renderItem={({ item }) => {
              const date = toDate(item.date);
              const details = buildDetails(item);
              const label = EVENT_LABELS[item.type];
              const accent = EVENT_COLORS[item.type];
              return (
                <View style={styles.itemRow}>
                  <View style={styles.timelineColumn}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: accent },
                      ]}
                    />
                    <View
                      style={[styles.line, { backgroundColor: borderColor }]}
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.card,
                      {
                        backgroundColor: Colors[colorScheme].background,
                        borderColor,
                      },
                    ]}
                    activeOpacity={0.9}
                    delayLongPress={250}
                    onLongPress={() => handleEventLongPress(item)}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTitleRow}>
                        {renderEventIcon(item.type, accent, 14)}
                        <Text
                          style={[
                            styles.cardTitle,
                            { color: Colors[colorScheme].text },
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.cardTime,
                          { color: Colors[colorScheme].tabIconDefault },
                        ]}
                      >
                        {formatTime(date)}
                      </Text>
                    </View>
                    {details ? (
                      <Text
                        style={[
                          styles.cardDetails,
                          { color: Colors[colorScheme].tabIconDefault },
                        ]}
                      >
                        {details}
                      </Text>
                    ) : null}
                    {item.note ? (
                      <Text
                        style={[
                          styles.cardNote,
                          { color: Colors[colorScheme].text },
                        ]}
                      >
                        {item.note}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>
      <InfoModal
        visible={!!infoModalMessage}
        title="Action indisponible"
        message={infoModalMessage ?? ""}
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onClose={() => setInfoModalMessage(null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
  },
  rangeRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 8,
  },
  filterRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  rangePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  rangeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterText: {
    fontSize: 12,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  sectionHeader: {
    marginTop: 14,
    marginBottom: 8,
    gap: 6,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
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
    fontSize: 11,
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
  cardNote: {
    marginTop: 6,
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
    gap: 10,
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
