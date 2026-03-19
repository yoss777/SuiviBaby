import { ThemedView } from "@/components/themed-view";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoModal } from "@/components/ui/InfoModal";
import { getNeutralColors } from "@/constants/dashboardColors";
import {
  ACTIVITY_TYPE_LABELS,
  BIBERON_TYPE_LABELS,
  EVENT_CONFIG,
  JALON_TYPE_LABELS,
  MOMENT_REPAS_LABELS,
  MOOD_EMOJIS,
} from "@/constants/dashboardConfig";
import { eventColors } from "@/constants/eventColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { ecouterEvenementsHybrid } from "@/migration/eventsHybridService";
import type { Event, EventType } from "@/services/eventsService";
import { supprimerEvenement } from "@/services/eventsService";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  AppState,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { StickyHeaderSectionList } from "react-native-sticky-parallax-header";
import { useHeaderRight } from "../../_layout";

// P11: Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// P10: Format selected date label for date chip
const formatSelectedDateLabel = (dateString: string) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

// ============================================
// TYPES
// ============================================

type RangeOption = 7 | 14 | 30;
type FilterType =
  | "meals"
  | "pumping"
  | "immunos"
  | "diapers"
  | "routines"
  | "activities"
  | "milestones"
  | "growth";

type TimelineSection = {
  title: string;
  key: string;
  data: Event[];
};

// ============================================
// CENTRALIZED CONFIGS
// ============================================

const STORAGE_KEY = "chrono_filters_v1";

const FILTER_CONFIG: Record<
  FilterType,
  {
    label: string;
    icon: string;
    iconLib?: "mci";
    color: string;
    eventTypes: EventType[];
  }
> = {
  meals: {
    label: "Repas",
    icon: "utensils",
    color: "#4A90E2",
    eventTypes: ["tetee", "biberon", "solide"],
  },
  pumping: {
    label: "Tire-lait",
    icon: "pump-medical",
    color: "#28a745",
    eventTypes: ["pompage"],
  },
  routines: {
    label: "Routines",
    icon: "bath",
    color: "#3b82f6",
    eventTypes: ["sommeil", "bain", "nettoyage_nez"],
  },
  immunos: {
    label: "Santé",
    icon: "prescription-bottle",
    color: "#9C27B0",
    eventTypes: ["vitamine", "vaccin", "temperature", "medicament", "symptome"],
  },
  diapers: {
    label: "Couches",
    icon: "human-baby-changing-table",
    iconLib: "mci",
    color: "#17a2b8",
    eventTypes: ["couche", "miction", "selle"],
  },
  activities: {
    label: "Activités",
    icon: "play-circle",
    color: "#10b981",
    eventTypes: ["activite"],
  },
  growth: {
    label: "Croissance",
    icon: "seedling",
    color: "#8BCF9B",
    eventTypes: ["croissance"],
  },
  milestones: {
    label: "Jalons",
    icon: "star",
    color: eventColors.jalon.dark,
    eventTypes: ["jalon"],
  },
};

const ALL_FILTERS: FilterType[] = [
  "meals",
  "pumping",
  "routines",
  "immunos",
  "diapers",
  "activities",
  "growth",
  "milestones",
];
const RANGE_OPTIONS: RangeOption[] = [7, 14, 30];
const FILTERS_TOP_OFFSET = 20;
const HEADER_SPACING = 0;
const FILTERS_HEIGHT = 52;
const LIST_PADDING_TOP = 8;

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

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
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
    const day = startOfDay(date);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(day.getDate()).padStart(2, "0")}`;
    if (!grouped.has(key)) {
      grouped.set(key, { date: day, items: [] });
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

const formatDuration = (minutes?: number) => {
  if (!minutes) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};

function buildDetails(event: Event) {
  switch (event.type) {
    case "biberon": {
      const typeLabel = event.typeBiberon
        ? BIBERON_TYPE_LABELS[event.typeBiberon]
        : null;
      const quantity = event.quantite ? `${event.quantite} ml` : null;
      const parts = [typeLabel, quantity].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "solide": {
      const typeLabels: Record<string, string> = {
        puree: "Purée", compote: "Compote", cereales: "Céréales",
        yaourt: "Yaourt", morceaux: "Morceaux", autre: "Autre",
      };
      const qtyLabels: Record<string, string> = {
        peu: "Un peu", moyen: "Moyen", beaucoup: "Beaucoup",
      };
      const momentLabel = event.momentRepas
        ? MOMENT_REPAS_LABELS[event.momentRepas]
        : null;
      const qtyLabel = event.quantite ? `Qté : ${qtyLabels[event.quantite as string]}` : null;
      const typeLabel = event.typeSolide ? typeLabels[event.typeSolide] : null;
      const line1Parts = [momentLabel, typeLabel, qtyLabel].filter(Boolean);
      const line1 = line1Parts.length > 0 ? line1Parts.join(" · ") : null;
      const dishName = event.nomNouvelAliment || event.ingredients || "";
      const line2 =
        event.aime === undefined
          ? dishName || null
          : event.aime
            ? dishName
              ? `A aimé ce plat : ${dishName}`
              : "A aimé ce plat"
            : dishName
              ? `N'a pas aimé ce plat : ${dishName}`
              : "N'a pas aimé ce plat";
      const parts = [line1, line2].filter(Boolean);
      return parts.length > 0 ? parts.join("\n") : undefined;
    }
    case "tetee": {
      const left = event.dureeGauche ? `G ${event.dureeGauche} min` : null;
      const right = event.dureeDroite ? `D ${event.dureeDroite} min` : null;
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
    case "croissance": {
      const parts = [
        event.poidsKg ? `${event.poidsKg} kg` : null,
        event.tailleCm ? `${event.tailleCm} cm` : null,
        event.teteCm ? `PC ${event.teteCm} cm` : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "miction":
      return event.volume ? `${event.volume} ml` : event.couleur;
    case "selle":
      return event.consistance || event.couleur;
    case "sommeil": {
      const start = event.heureDebut
        ? toDate(event.heureDebut)
        : toDate(event.date);
      const end = event.heureFin ? toDate(event.heureFin) : null;
      const duration =
        event.duree ??
        (end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0);

      const parts = [
        end ? formatDuration(duration) : null,
        event.location,
        event.quality,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "bain": {
      const parts = [
        event.duree ? `${event.duree} min` : null,
        event.temperatureEau ? `${event.temperatureEau}°C` : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }

    case "nettoyage_nez": {
      const methodeLabels: Record<string, string> = {
        serum: "Sérum", mouche_bebe: "Mouche-bébé", coton: "Coton", autre: "Autre",
      };
      const resultatLabels: Record<string, string> = {
        efficace: "Efficace", mucus_clair: "Clair", mucus_epais: "Épais", mucus_colore: "Coloré",
      };
      const parts = [
        event.methode ? methodeLabels[event.methode] : null,
        event.resultat ? resultatLabels[event.resultat] : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }

    case "temperature": {
      const value =
        typeof event.valeur === "number" ? `${event.valeur}°C` : undefined;
      return [value, event.modePrise].filter(Boolean).join(" · ") || undefined;
    }
    case "medicament": {
      const name = event.nomMedicament || "Médicament";
      return event.dosage ? `${name} · ${event.dosage}` : name;
    }
    case "symptome": {
      const list = Array.isArray(event.symptomes)
        ? event.symptomes.join(", ")
        : undefined;
      return [list, event.intensite].filter(Boolean).join(" · ") || undefined;
    }

    case "vaccin":
      if (!event.nomVaccin) return event.dosage;
      return event.dosage
        ? `${event.nomVaccin} · ${event.dosage}`
        : event.nomVaccin;
    case "vitamine":
      if (!event.nomVitamine) return event.dosage;
      return event.dosage
        ? `${event.nomVitamine} · ${event.dosage}`
        : event.nomVitamine;
    case "activite": {
      const isOther = event.typeActivite === "autre";
      const parts = [
        event.duree ? formatDuration(event.duree) : null,
        isOther ? null : event.description,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "jalon": {
      if (event.typeJalon === "humeur") {
        return typeof event.humeur === "number"
          ? MOOD_EMOJIS[event.humeur]
          : undefined;
      }
      return event.description || undefined;
    }
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

// ============================================
// EXTRACTED COMPONENTS
// ============================================

interface EventIconProps {
  type: EventType;
  color: string;
  size: number;
}

const EventIcon = React.memo(({ type, color, size }: EventIconProps) => {
  const config = EVENT_CONFIG[type];
  if (!config) return null;
  if (config.icon.lib === "mci") {
    return (
      <MaterialCommunityIcons
        name={config.icon.name as any}
        size={size}
        color={color}
      />
    );
  }
  return (
    <FontAwesome name={config.icon.name as any} size={size} color={color} />
  );
});
EventIcon.displayName = "EventIcon";

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
  stickyContainer: {
    paddingTop: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: HEADER_SPACING,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
  },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderRadius: 20,
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  rangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  rangeChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  listPadding: {
    paddingTop: 0,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
  },
  stickyFilters: {
    height: FILTERS_HEIGHT + FILTERS_TOP_OFFSET,
    justifyContent: "flex-end",
    paddingTop: FILTERS_TOP_OFFSET,
  },
  filterScrollContainer: {
    flex: 1,
    position: "relative",
    justifyContent: "center",
  },
  filterFadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
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
  filterChipBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    marginLeft: 2,
  },
  filterChipBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
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
    paddingTop: LIST_PADDING_TOP,
  },
  sectionHeader: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
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
  lineLast: {
    backgroundColor: "transparent",
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
  cardThumb: {
    width: 34,
    height: 34,
    borderRadius: 8,
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
  cardTimeLeft: {
    width: 42,
    marginTop: 6,
  },
  cardTimeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardTimeArrow: {
    fontSize: 10,
    lineHeight: 10,
    fontWeight: "600",
  },
  cardTimeTextSecondary: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardTimeOngoing: {
    fontSize: 10,
    fontWeight: "700",
  },
  cardDetails: {
    marginTop: 6,
    fontSize: 12,
  },
  solideDetails: {
    marginTop: 6,
  },
  solideDetailsText: {
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
  emptyText: {
    fontSize: 13,
    textAlign: "center",
  },
  deleteAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    marginBottom: 15,
    borderRadius: 14,
    marginHorizontal: 4,
    marginVertical: 1,
    gap: 4,
  },
  deleteActionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  // P4: Calendar & date chip styles
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
    gap: 0,
  },
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dateChipRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateChipText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  calendarContainer: {
    marginTop: 12,
    borderBottomWidth: 1,
    paddingBottom: 12,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  calendarDayButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  calendarDayText: {
    fontSize: 12,
    fontWeight: "600",
  },
  // P1: Skeleton styles
  skeletonContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  skeletonSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  skeletonItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  skeletonDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 6,
    overflow: "hidden",
  },
  skeletonLine: {
    width: 2,
    height: 40,
    marginTop: 4,
  },
  skeletonCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  skeletonBlock: {
    borderRadius: 7,
    overflow: "hidden",
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 100,
  },
});

interface FilterChipProps {
  type: FilterType;
  isActive: boolean;
  textColor: string;
  count?: number;
  onPress: () => void;
}

const FilterChip = React.memo(
  ({ type, isActive, textColor, count, onPress }: FilterChipProps) => {
    const config = FILTER_CONFIG[type];
    return (
      <TouchableOpacity
        style={[
          styles.filterChip,
          { borderColor: config.color, borderWidth: 0 },
          isActive && { backgroundColor: `${config.color}1A` },
        ]}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Filtre ${config.label}${count ? `, ${count} événements` : ""}`}
        accessibilityState={{ selected: isActive }}
      >
        {config.iconLib === "mci" ? (
          <MaterialCommunityIcons
            name={config.icon as any}
            size={12}
            color={config.color}
          />
        ) : (
          <FontAwesome
            name={config.icon as any}
            size={12}
            color={config.color}
          />
        )}
        <Text style={[styles.filterChipText, { color: textColor }]}>
          {config.label}
        </Text>
        {typeof count === "number" && count > 0 && (
          <View
            style={[
              styles.filterChipBadge,
              {
                backgroundColor: isActive ? config.color : `${config.color}40`,
              },
            ]}
          >
            <Text style={styles.filterChipBadgeText}>{count}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  },
);
FilterChip.displayName = "FilterChip";

interface RangeChipProps {
  value: RangeOption;
  isActive: boolean;
  tintColor: string;
  mutedColor: string;
  onPress: () => void;
  activeBg: string;
}

const RangeChip = React.memo(
  ({
    value,
    isActive,
    tintColor,
    mutedColor,
    activeBg,
    onPress,
  }: RangeChipProps) => (
    <TouchableOpacity
      style={[styles.rangeChip, isActive && { backgroundColor: activeBg }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Afficher ${value} jours`}
      accessibilityState={{ selected: isActive }}
    >
      <Text
        style={[
          styles.rangeChipText,
          { color: isActive ? tintColor : mutedColor },
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
          if (!config) return null;
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
  backgroundColor: string;
}

const SectionHeader = React.memo(
  ({
    title,
    count,
    counts,
    borderColor,
    textColor,
    backgroundColor,
  }: SectionHeaderProps) => (
    <View style={[styles.sectionHeader, { backgroundColor }]}>
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
  isLastInSection: boolean;
  onPress?: () => void;
  currentTime: Date;
}

const TimelineCard = React.memo(
  ({
    event,
    borderColor,
    backgroundColor,
    textColor,
    secondaryTextColor,
    isLastInSection,
    onPress,
    currentTime,
  }: TimelineCardProps) => {
    const date = toDate(event.date);
    const config = EVENT_CONFIG[event.type];
    if (!config) return null;
    const isSleep = event.type === "sommeil";
    const isActivity = event.type === "activite";
    const isJalon = event.type === "jalon";
    const isSolide = event.type === "solide";

    // Build solide-specific details inline (avoids double computation with buildDetails)
    const solideTypeLabels: Record<string, string> = {
      puree: "Purée", compote: "Compote", cereales: "Céréales",
      yaourt: "Yaourt", morceaux: "Morceaux", autre: "Autre",
    };
    const solideQtyLabels: Record<string, string> = {
      peu: "Un peu", moyen: "Moyen", beaucoup: "Beaucoup",
    };
    const solideMomentLabel = isSolide && event.momentRepas
      ? MOMENT_REPAS_LABELS[event.momentRepas] ?? null
      : null;
    const solideTypeLabel = isSolide && event.typeSolide
      ? solideTypeLabels[event.typeSolide] ?? null
      : null;
    const solideQtyLabel = isSolide && event.quantite
      ? `Qté : ${solideQtyLabels[event.quantite as string] ?? ""}`
      : null;
    const solideLine1Parts = [solideMomentLabel, solideTypeLabel, solideQtyLabel].filter(Boolean);
    const solideLine2 = solideLine1Parts.length > 0 ? solideLine1Parts.join(" · ") : null;

    const solideDishName = isSolide
      ? event.nomNouvelAliment || event.ingredients || ""
      : "";
    const solideLikeLabel = isSolide
      ? event.aime === undefined
        ? solideDishName || null
        : event.aime
          ? solideDishName
            ? `A aimé ce plat : ${solideDishName}`
            : "A aimé ce plat"
          : solideDishName
            ? `N'a pas aimé ce plat : ${solideDishName}`
            : "N'a pas aimé ce plat"
      : null;
    const solideLikeColor = isSolide
      ? event.aime === undefined
        ? "#22c55e"
        : event.aime
          ? "#22c55e"
          : "#ef4444"
      : undefined;

    // Non-solide details
    const details = isSolide ? undefined : buildDetails(event);

    // Determine the label based on event type
    let displayLabel = config.label;
    if (isSleep && typeof event.isNap === "boolean") {
      displayLabel = event.isNap ? "Sieste" : "Nuit de sommeil";
    } else if (isActivity && event.typeActivite) {
      if (event.typeActivite === "autre") {
        const customLabel =
          typeof event.description === "string"
            ? event.description.trim()
            : typeof event.note === "string"
              ? event.note.trim()
              : "";
        if (customLabel) {
          displayLabel = `Activité : ${customLabel}`;
        } else {
          displayLabel =
            ACTIVITY_TYPE_LABELS[event.typeActivite] || config.label;
        }
      } else {
        displayLabel = ACTIVITY_TYPE_LABELS[event.typeActivite] || config.label;
      }
    } else if (isJalon && event.typeJalon) {
      if (event.typeJalon === "autre") {
        displayLabel = event.titre || JALON_TYPE_LABELS.autre || config.label;
      } else {
        displayLabel = JALON_TYPE_LABELS[event.typeJalon] || config.label;
      }
    }

    const sleepLabel = displayLabel;
    const sleepIconName =
      isSleep && typeof event.isNap === "boolean"
        ? event.isNap
          ? "bed"
          : "moon"
        : null;

    // Calculate elapsed time for ongoing sleep or promenade
    const isOngoingSleep = isSleep && !event.heureFin && event.heureDebut;
    const isOngoingPromenade = event.type === "activite" && event.typeActivite === "promenade" && !event.heureFin && event.heureDebut;
    const isOngoing = isOngoingSleep || isOngoingPromenade;
    const hasStartEnd = (isSleep || (event.type === "activite" && event.typeActivite === "promenade")) && !!event.heureDebut;
    const elapsedMinutes = isOngoing
      ? Math.max(
          0,
          Math.round(
            (currentTime.getTime() - toDate(event.heureDebut).getTime()) /
              60000,
          ),
        )
      : 0;

    return (
      <View style={styles.itemRow}>
        <View style={styles.timelineColumn}>
          <View style={[styles.dot, { backgroundColor: config.color }]} />
          <View
            style={[
              styles.line,
              { backgroundColor: borderColor },
              isLastInSection && styles.lineLast,
            ]}
          />
        </View>
        <View style={styles.cardTimeLeft}>
          {hasStartEnd && event.heureFin ? (
            <>
              <Text
                style={[styles.cardTimeText, { color: secondaryTextColor }]}
              >
                {event.heureDebut ? formatTime(toDate(event.heureDebut)) : formatTime(date)}
              </Text>
              <Text
                style={[styles.cardTimeArrow, { color: secondaryTextColor }]}
              >
                ↓
              </Text>
              <Text
                style={[
                  styles.cardTimeTextSecondary,
                  { color: secondaryTextColor },
                ]}
              >
                {formatTime(toDate(event.heureFin))}
              </Text>
            </>
          ) : hasStartEnd && !event.heureFin ? (
            <>
              <Text
                style={[styles.cardTimeText, { color: secondaryTextColor }]}
              >
                {event.heureDebut ? formatTime(toDate(event.heureDebut)) : formatTime(date)}
              </Text>
              <Text
                style={[styles.cardTimeArrow, { color: secondaryTextColor }]}
              >
                ↓
              </Text>
              <Text
                style={[
                  styles.cardTimeOngoing,
                  { color: isOngoingPromenade ? eventColors.activite.dark : eventColors.sommeil.dark },
                ]}
              >
                en cours
              </Text>
            </>
          ) : (
            <Text style={[styles.cardTimeText, { color: secondaryTextColor }]}>
              {formatTime(date)}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.card, { backgroundColor, borderColor }]}
          activeOpacity={0.85}
          onPress={onPress}
          disabled={!onPress}
          accessibilityRole="button"
          accessibilityLabel={`${displayLabel}, ${formatTime(date)}${details ? `, ${details}` : ""}`}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              {isSleep && sleepIconName ? (
                <FontAwesome
                  name={sleepIconName as any}
                  size={12}
                  color={config.color}
                />
              ) : (
                <EventIcon type={event.type} color={config.color} size={14} />
              )}
              <Text style={[styles.cardTitle, { color: textColor }]}>
                {sleepLabel}
              </Text>
            </View>
            {isJalon && event.photos?.[0] ? (
              <Image
                source={{ uri: event.photos[0] }}
                style={[styles.cardThumb, { backgroundColor: secondaryTextColor + "20" }]}
              />
            ) : null}
          </View>
          {!isSolide && (details || isOngoing) && (
            <Text style={[styles.cardDetails, { color: secondaryTextColor }]}>
              {isOngoing
                ? details
                  ? `${formatDuration(elapsedMinutes)} · ${details}`
                  : formatDuration(elapsedMinutes)
                : details}
            </Text>
          )}
          {isSolide && (solideLine2 || solideLikeLabel) && (
            <View style={styles.solideDetails}>
              {solideLine2 && (
                <Text
                  style={[
                    styles.solideDetailsText,
                    { color: secondaryTextColor },
                  ]}
                >
                  {solideLine2}
                </Text>
              )}
              {solideLikeLabel && (
                <Text
                  style={[
                    styles.solideDetailsText,
                    { color: solideLikeColor ?? secondaryTextColor },
                  ]}
                >
                  {solideLikeLabel}
                </Text>
              )}
            </View>
          )}
          {event.type !== "activite" && event.note && (
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

const DeleteAction = React.memo(function DeleteAction({
  onPress,
}: {
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.deleteAction, { backgroundColor: "#ef4444" }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Supprimer cet événement"
    >
      <Ionicons name="trash-outline" size={20} color="#fff" />
      <Text style={styles.deleteActionText}>Supprimer</Text>
    </Pressable>
  );
});

// ============================================
// P1: SKELETON SHIMMER COMPONENT
// ============================================

const ChronoSkeleton = React.memo(function ChronoSkeleton({
  colorScheme,
}: {
  colorScheme: "light" | "dark";
}) {
  const nc = getNeutralColors(colorScheme);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerAnim]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });
  const shimmerBg = colorScheme === "dark" ? nc.shimmerDark : nc.shimmerLight;

  const shimmerStyle = [
    styles.shimmerOverlay,
    {
      backgroundColor: shimmerBg,
      transform: [{ translateX: shimmerTranslate }],
    },
  ];

  const renderSkeletonCard = (key: number) => (
    <View key={key} style={styles.skeletonItemRow}>
      <View style={styles.timelineColumn}>
        <View style={[styles.skeletonDot, { backgroundColor: nc.borderLight }]}>
          <Animated.View style={shimmerStyle} />
        </View>
        <View
          style={[styles.skeletonLine, { backgroundColor: nc.borderLight }]}
        />
      </View>
      <View
        style={[
          styles.skeletonBlock,
          {
            width: 42,
            height: 14,
            marginTop: 6,
            backgroundColor: nc.borderLight,
          },
        ]}
      >
        <Animated.View style={shimmerStyle} />
      </View>
      <View
        style={[
          styles.skeletonCard,
          {
            backgroundColor: nc.backgroundCard,
            borderColor: nc.borderLight,
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={[
              styles.skeletonBlock,
              {
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: nc.borderLight,
              },
            ]}
          >
            <Animated.View style={shimmerStyle} />
          </View>
          <View
            style={[
              styles.skeletonBlock,
              { width: 100, height: 14, backgroundColor: nc.borderLight },
            ]}
          >
            <Animated.View style={shimmerStyle} />
          </View>
        </View>
        <View
          style={[
            styles.skeletonBlock,
            {
              width: 80,
              height: 12,
              marginTop: 6,
              backgroundColor: nc.borderLight,
            },
          ]}
        >
          <Animated.View style={shimmerStyle} />
        </View>
      </View>
    </View>
  );

  return (
    <View
      style={styles.skeletonContainer}
      accessibilityLabel="Chargement en cours"
    >
      {/* Section header skeleton */}
      <View style={styles.skeletonSectionHeader}>
        <View
          style={[
            styles.skeletonBlock,
            { width: 120, height: 20, backgroundColor: nc.borderLight },
          ]}
        >
          <Animated.View style={shimmerStyle} />
        </View>
        <View
          style={[
            styles.skeletonBlock,
            {
              width: 30,
              height: 20,
              borderRadius: 10,
              backgroundColor: nc.borderLight,
            },
          ]}
        >
          <Animated.View style={shimmerStyle} />
        </View>
      </View>
      {renderSkeletonCard(1)}
      {renderSkeletonCard(2)}
      {renderSkeletonCard(3)}

      {/* Second section */}
      <View style={[styles.skeletonSectionHeader, { marginTop: 16 }]}>
        <View
          style={[
            styles.skeletonBlock,
            { width: 80, height: 20, backgroundColor: nc.borderLight },
          ]}
        >
          <Animated.View style={shimmerStyle} />
        </View>
        <View
          style={[
            styles.skeletonBlock,
            {
              width: 30,
              height: 20,
              borderRadius: 10,
              backgroundColor: nc.borderLight,
            },
          ]}
        >
          <Animated.View style={shimmerStyle} />
        </View>
      </View>
      {renderSkeletonCard(4)}
      {renderSkeletonCard(5)}
    </View>
  );
});

// ============================================
// MAIN COMPONENT
// ============================================

export default function ChronoScreen() {
  const { activeChild } = useBaby();
  const { firebaseUser } = useAuth();
  const { openSheet: openSheetRaw } = useSheet();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const headerOwnerId = useRef(`chrono-${Math.random().toString(36).slice(2)}`);
  const sheetOwnerId = "chrono";
  const [refreshTick, setRefreshTick] = useState(0);
  const [range, setRange] = useState<RangeOption>(14);
  const [maxRange, setMaxRange] = useState<RangeOption>(14);
  const [selectedTypes, setSelectedTypes] = useState<FilterType[]>(ALL_FILTERS);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [currentDay, setCurrentDay] = useState(() => dayKey(new Date()));
  const [currentTime, setCurrentTime] = useState(new Date());
  const hasLoadedPrefs = useRef(false);
  const hasInitialLoad = useRef(false);
  const hasPrefetchedMore = useRef(false);
  const [infoModalMessage, setInfoModalMessage] = useState<string | null>(null);
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canManageContent =
    permissions.role === "owner" || permissions.role === "admin";
  const { showToast, showUndoToast, showActionToast } = useToast();
  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    event: Event | null;
  }>({ visible: false, event: null });

  // P4: Calendar date picker state
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // P5: Soft-delete state
  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(new Set());

  const triggerRefresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const openSheet = useCallback(
    (props: Parameters<typeof openSheetRaw>[0]) => {
      openSheetRaw({
        ...props,
        onSuccess: () => {
          (props as any).onSuccess?.();
          triggerRefresh();
          // P6: Toast on sheet success
          showToast("Événement enregistré");
        },
      });
    },
    [openSheetRaw, triggerRefresh, showToast],
  );

  // Fade animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Theme colors — use design system
  const nc = useMemo(() => getNeutralColors(colorScheme), [colorScheme]);
  const colors = useMemo(
    () => ({
      text: nc.textStrong,
      background: nc.backgroundCard,
      surface: nc.background,
      tint: nc.todayAccent,
      secondary: nc.textMuted,
      secondaryText: nc.textLight,
      border: nc.border,
      borderLight: nc.borderLight,
    }),
    [nc],
  );

  const updateCurrentDay = useCallback(() => {
    const now = new Date();
    const next = dayKey(now);
    setCurrentDay((prev) => (prev === next ? prev : next));
    setCurrentTime(now);
  }, []);

  useEffect(() => {
    const interval = setInterval(updateCurrentDay, 60 * 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        updateCurrentDay();
      }
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [updateCurrentDay]);

  // All event types for the timeline
  const ALL_EVENT_TYPES: EventType[] = [
    "tetee",
    "biberon",
    "solide",
    "pompage",
    "croissance",
    "couche",
    "miction",
    "selle",
    "vaccin",
    "vitamine",
    "sommeil",
    "bain",
    "temperature",
    "medicament",
    "symptome",
    "activite",
    "jalon",
    "nettoyage_nez",
  ];

  // Load events with unified listener
  useEffect(() => {
    if (!activeChild?.id) return;

    const showFullLoading = !hasInitialLoad.current;
    setLoading(showFullLoading);
    setIsRefreshing(!showFullLoading);
    if (showFullLoading) {
      fadeAnim.setValue(0);
    }

    const since = startOfDay(new Date());
    since.setDate(since.getDate() - (maxRange - 1));

    const unsubscribe = ecouterEvenementsHybrid(
      activeChild.id,
      (data) => {
        const sorted = data.sort(
          (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime(),
        );
        setEvents(sorted);
        hasInitialLoad.current = true;
        setLoading(false);
        setIsRefreshing(false);

        // P5: Clean up soft-deleted IDs that are no longer in the dataset
        setSoftDeletedIds((prev) => {
          if (prev.size === 0) return prev;
          const dataIds = new Set(data.map((e: Event) => e.id));
          const next = new Set<string>();
          prev.forEach((id) => {
            if (id && dataIds.has(id)) next.add(id);
          });
          return next.size === prev.size ? prev : next;
        });

        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      },
      {
        types: ALL_EVENT_TYPES,
        depuis: since,
        waitForServer: true,
      },
    );

    return unsubscribe;
  }, [activeChild?.id, maxRange, currentDay, refreshTick]);

  // Reset on child change
  useEffect(() => {
    if (!activeChild?.id) return;
    setEvents([]);
    setLoading(true);
    setIsRefreshing(false);
    setRange(14);
    setMaxRange(14);
    hasInitialLoad.current = false;
    hasPrefetchedMore.current = false;
    setSoftDeletedIds(new Set());
    setSelectedDate(null);
    setShowCalendar(false);
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
          setMaxRange(parsed.range);
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

    const rangeStart = startOfDay(new Date());
    rangeStart.setDate(rangeStart.getDate() - (range - 1));

    return events.filter((event) => {
      // P5: Filter out soft-deleted events
      if (event.id && softDeletedIds.has(event.id)) return false;

      if (!effectiveTypes.has(event.type)) return false;
      if (toDate(event.date) < rangeStart) return false;

      // P4: Filter by selected date if set
      if (selectedDate) {
        const eventDate = toDate(event.date);
        const eventDay = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, "0")}-${String(eventDate.getDate()).padStart(2, "0")}`;
        return eventDay === selectedDate;
      }

      return true;
    });
  }, [events, selectedTypes, range, currentDay, softDeletedIds, selectedDate]);

  // Sections
  const sections = useMemo(
    () => buildSections(filteredEvents),
    [filteredEvents, currentDay],
  );

  useEffect(() => {
    if (loading) {
      setEmptyDelayDone(false);
      return;
    }
    if (sections.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 500);
    return () => clearTimeout(timer);
  }, [loading, sections.length]);

  // Handlers with useCallback
  const handleRangeChange = useCallback(
    (value: RangeOption) => {
      // P2: Animate section transitions
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (value > maxRange) {
        setMaxRange(value);
        setIsRefreshing(true);
      }
      setRange(value);
    },
    [maxRange],
  );

  const handleNearEndReached = useCallback(() => {
    if (maxRange >= 30 || hasPrefetchedMore.current) return;
    hasPrefetchedMore.current = true;
    setMaxRange(30);
    setIsRefreshing(true);
  }, [maxRange]);

  // Count events per filter type (using unfiltered events + range)
  const filterCounts = useMemo(() => {
    const rangeStart = startOfDay(new Date());
    rangeStart.setDate(rangeStart.getDate() - (range - 1));
    const inRange = events.filter((e) => toDate(e.date) >= rangeStart);

    const counts: Record<FilterType, number> = {} as any;
    for (const filter of ALL_FILTERS) {
      const types = new Set(FILTER_CONFIG[filter].eventTypes);
      counts[filter] = inRange.filter((e) => types.has(e.type)).length;
    }
    return counts;
  }, [events, range, currentDay]);

  const allSelected = selectedTypes.length === ALL_FILTERS.length;

  const handleToggleAll = useCallback(() => {
    // P2: Animate section transitions
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedTypes(allSelected ? [] : [...ALL_FILTERS]);
  }, [allSelected]);

  const handleFilterToggle = useCallback((type: FilterType) => {
    // P2: Animate section transitions
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((value) => value !== type)
        : [...prev, type],
    );
  }, []);

  const handlePullToRefresh = useCallback(() => {
    setIsRefreshing(true);
    triggerRefresh();
  }, [triggerRefresh]);

  // P4: Calendar date picker handlers
  const handleCalendarToggle = useCallback(() => {
    setShowCalendar((prev) => !prev);
  }, []);

  // Calendar button in navigation header right (same pattern as routines)
  useFocusEffect(
    useCallback(() => {
      const headerButton = (
        <View style={styles.headerButtons}>
          <Pressable
            onPress={handleCalendarToggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[
              styles.headerButton,
              showCalendar && {
                backgroundColor: `${Colors[colorScheme].tint}20`,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              showCalendar ? "Fermer le calendrier" : "Ouvrir le calendrier"
            }
          >
            <Ionicons
              name="calendar-outline"
              size={24}
              color={Colors[colorScheme].tint}
            />
          </Pressable>
        </View>
      );
      setHeaderRight(headerButton, headerOwnerId.current);
      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [handleCalendarToggle, showCalendar, colorScheme, setHeaderRight]),
  );

  const handleDateSelect = useCallback((dateString: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDate(dateString);
    setShowCalendar(false);
  }, []);

  const handleClearDate = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDate(null);
    setShowCalendar(false);
  }, []);

  const handleEdit = useCallback(
    (event: Event) => {
      if (!event.id) {
        setInfoModalMessage("Cet événement ne peut pas être modifié ici.");
        return;
      }

      const eventDate = toDate(event.date);

      // Handle meals (tetee, biberon, solide)
      if (
        event.type === "tetee" ||
        event.type === "biberon" ||
        event.type === "solide"
      ) {
        const e = event as any;
        openSheet({
          ownerId: sheetOwnerId,
          formType: "meals",
          mealType: event.type,
          editData: {
            id: event.id,
            type: event.type,
            date: eventDate,
            quantite: e.quantite,
            dureeGauche: e.dureeGauche,
            dureeDroite: e.dureeDroite,
            typeBiberon: e.typeBiberon,
            typeSolide: e.typeSolide,
            momentRepas: e.momentRepas,
            ingredients: e.ingredients,
            quantiteSolide: e.quantiteSolide,
            nouveauAliment: e.nouveauAliment,
            nomNouvelAliment: e.nomNouvelAliment,
            allergenes: e.allergenes,
            reaction: e.reaction,
            aime: e.aime,
          },
        });
        return;
      }

      // Handle pumping
      if (event.type === "pompage") {
        openSheet({
          ownerId: sheetOwnerId,
          formType: "pumping",
          editData: {
            id: event.id,
            date: eventDate,
            quantiteGauche: event.quantiteGauche,
            quantiteDroite: event.quantiteDroite,
            duree: event.duree,
            note: event.note,
          },
        });
        return;
      }

      // Handle diapers (miction, selle)
      if (event.type === "miction") {
        openSheet({
          ownerId: sheetOwnerId,
          formType: "diapers",
          diapersType: "miction",
          editData: {
            id: event.id,
            type: "miction",
            date: eventDate,
            couleur: event.couleur,
          },
        });
        return;
      }
      if (event.type === "selle") {
        openSheet({
          ownerId: sheetOwnerId,
          formType: "diapers",
          diapersType: "selle",
          editData: {
            id: event.id,
            type: "selle",
            date: eventDate,
            consistance: event.consistance,
            quantite: event.quantite,
          },
        });
        return;
      }

      // Handle routines (sommeil, bain)
      if (event.type === "sommeil") {
        openSheet({
          ownerId: sheetOwnerId,
          formType: "routines",
          routineType: "sommeil",
          sleepMode: event.isNap ? "nap" : "night",
          editData: {
            id: event.id,
            type: "sommeil",
            date: toDate(event.heureDebut ?? event.date),
            heureDebut: toDate(event.heureDebut ?? event.date),
            heureFin: event.heureFin ? toDate(event.heureFin) : undefined,
            isNap: event.isNap,
            location: event.location,
            quality: event.quality,
            note: event.note,
          },
        });
        return;
      }
      if (event.type === "bain") {
        openSheet({
          ownerId: sheetOwnerId,
          formType: "routines",
          routineType: "bain",
          editData: {
            id: event.id,
            type: "bain",
            date: eventDate,
            duree: event.duree,
            temperatureEau: event.temperatureEau,
            note: event.note,
          },
        });
        return;
      }
      if ((event as any).type === "nettoyage_nez") {
        const nez = event as any;
        openSheet({
          ownerId: sheetOwnerId,
          formType: "routines",
          routineType: "nettoyage_nez",
          editData: {
            id: nez.id,
            type: "nettoyage_nez",
            date: eventDate,
            methode: nez.methode,
            resultat: nez.resultat,
            note: nez.note,
          },
        });
        return;
      }

      // Handle soins (temperature, medicament, symptome, vaccin, vitamine)
      if (
        event.type === "temperature" ||
        event.type === "medicament" ||
        event.type === "symptome" ||
        event.type === "vaccin" ||
        event.type === "vitamine"
      ) {
        const e = event as any;
        openSheet({
          ownerId: sheetOwnerId,
          formType: "soins",
          soinsType: event.type,
          editData: {
            id: event.id,
            type: event.type,
            date: eventDate,
            valeur: e.valeur,
            modePrise: e.modePrise,
            nomMedicament: e.nomMedicament,
            dosage: e.dosage,
            symptomes: e.symptomes,
            intensite: e.intensite,
            nomVaccin: e.nomVaccin,
            nomVitamine: e.nomVitamine,
            note: e.note,
          },
        });
        return;
      }

      // Handle activities
      if (event.type === "activite") {
        openSheet({
          ownerId: sheetOwnerId,
          formType: "activities",
          activiteType:
            (event.typeActivite as
              | "tummyTime"
              | "jeux"
              | "lecture"
              | "promenade"
              | "massage"
              | "musique"
              | "eveil"
              | "sortie"
              | "autre") ?? "autre",
          editData: {
            id: event.id,
            typeActivite:
              (event.typeActivite as
                | "tummyTime"
                | "jeux"
                | "lecture"
                | "promenade"
                | "massage"
                | "musique"
                | "eveil"
                | "sortie"
                | "autre") ?? "autre",
            date: eventDate,
            duree: event.duree,
            description: event.description,
          },
        });
        return;
      }

      // Handle growth (croissance)
      if (event.type === "croissance") {
        openSheet({
          ownerId: sheetOwnerId,
          formType: "croissance",
          editData: {
            id: event.id,
            date: eventDate,
            tailleCm: event.tailleCm,
            poidsKg: event.poidsKg,
            teteCm: event.teteCm,
          },
        });
        return;
      }

      // Handle milestones (jalon)
      if (event.type === "jalon") {
        openSheet({
          ownerId: sheetOwnerId,
          formType: "milestones",
          jalonType:
            (event.typeJalon as
              | "dent"
              | "pas"
              | "sourire"
              | "mot"
              | "humeur"
              | "photo"
              | "autre") ?? "autre",
          editData: {
            id: event.id,
            typeJalon:
              (event.typeJalon as
                | "dent"
                | "pas"
                | "sourire"
                | "mot"
                | "humeur"
                | "photo"
                | "autre") ?? "autre",
            titre: event.titre,
            description: event.description,
            note: event.note,
            humeur: event.humeur,
            photos: event.photos,
            date: eventDate,
          },
        });
        return;
      }

      // Fallback for unsupported types
      setInfoModalMessage("Cet événement ne peut pas être modifié ici.");
    },
    [openSheet],
  );

  const handleEventDelete = useCallback((event: Event) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, event });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.event?.id) return;
    const eventId = deleteConfirm.event.id;
    const childId = activeChild.id;
    setDeleteConfirm({ visible: false, event: null });

    // P5: Soft-delete — hide immediately from UI
    setSoftDeletedIds((prev) => new Set(prev).add(eventId));

    // P5: Show undo toast
    showUndoToast(
      "Événement supprimé",
      // onUndo — restore visibility
      () => {
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      },
      // onExpire — actually delete from Firestore
      async () => {
        try {
          await supprimerEvenement(childId, eventId);
          triggerRefresh();
        } catch {
          // P27: Restore on error + retry action toast
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(eventId);
            return next;
          });
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            supprimerEvenement(childId, eventId).catch(() => {
              showActionToast(
                "Erreur lors de la suppression",
                "Réessayer",
                () => {
                  supprimerEvenement(childId, eventId);
                },
              );
            });
          });
        }
      },
      4000,
    );
  }, [
    activeChild?.id,
    deleteConfirm.event,
    showUndoToast,
    showActionToast,
    triggerRefresh,
  ]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, event: null });
  }, []);

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
          backgroundColor={colors.surface}
        />
      );
    },
    [colors.border, colors.text, colors.surface],
  );

  // Render item
  const renderItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: Event;
      index: number;
      section: TimelineSection;
    }) => {
      const isLastInSection = index === section.data.length - 1;
      return (
        <ReanimatedSwipeable
          renderRightActions={
            canManageContent && item.id
              ? () => <DeleteAction onPress={() => handleEventDelete(item)} />
              : undefined
          }
          friction={2}
          rightThreshold={40}
          overshootRight={false}
          enabled={canManageContent && !!item.id}
        >
          <TimelineCard
            event={item}
            borderColor={`${Colors[colorScheme].tabIconDefault}30`}
            backgroundColor={colors.background}
            textColor={colors.text}
            secondaryTextColor={colors.secondaryText}
            isLastInSection={isLastInSection}
            onPress={canManageContent ? () => handleEdit(item) : undefined}
            currentTime={currentTime}
          />
        </ReanimatedSwipeable>
      );
    },
    [
      canManageContent,
      colors.background,
      colors.secondaryText,
      colors.text,
      handleEdit,
      handleEventDelete,
      currentTime,
      colorScheme,
    ],
  );

  // Key extractor
  const keyExtractor = useCallback(
    (item: Event) => item.id || `${item.type}-${item.date}`,
    [],
  );

  return (
    <ThemedView style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        {/* Content */}
        <View style={styles.content}>
          {loading || (!emptyDelayDone && sections.length === 0) ? (
            <ChronoSkeleton colorScheme={colorScheme} />
          ) : (
            <Animated.View style={[styles.listWrapper, { opacity: fadeAnim }]}>
              <StickyHeaderSectionList
                sections={sections}
                keyExtractor={keyExtractor}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                windowSize={7}
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                removeClippedSubviews={false}
                updateCellsBatchingPeriod={50}
                onEndReached={handleNearEndReached}
                onEndReachedThreshold={0.4}
                stickySectionHeadersEnabled
                renderSectionHeader={renderSectionHeader}
                renderItem={renderItem}
                containerStyle={[
                  styles.stickyContainer,
                  { backgroundColor: colors.surface },
                ]}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handlePullToRefresh}
                    tintColor={colors.tint}
                  />
                }
                renderHeader={() => (
                  <View style={styles.header}>
                    <View style={styles.headerRow}>
                      <Text style={[styles.title, { color: colors.text }]}>
                        Chronologie
                      </Text>
                      <View
                        style={[
                          styles.rangeRow,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.background,
                          },
                        ]}
                      >
                        {RANGE_OPTIONS.map((value) => (
                          <RangeChip
                            key={value}
                            value={value}
                            isActive={range === value}
                            tintColor={colors.tint}
                            mutedColor={colors.secondaryText}
                            activeBg={colors.surface}
                            onPress={() => handleRangeChange(value)}
                          />
                        ))}
                      </View>
                    </View>
                    {/* P4: Date chip with clear button */}
                    {selectedDate && (
                      <View style={styles.dateChipRow}>
                        <Pressable
                          style={[
                            styles.dateChip,
                            { backgroundColor: colors.tint },
                          ]}
                          onPress={handleClearDate}
                          accessibilityRole="button"
                          accessibilityLabel="Effacer la date sélectionnée"
                        >
                          <Text
                            style={[
                              styles.dateChipText,
                              {
                                color:
                                  colorScheme === "dark"
                                    ? Colors[colorScheme].background
                                    : "#fff",
                              },
                            ]}
                          >
                            {formatSelectedDateLabel(selectedDate)}
                          </Text>
                          <Ionicons name="close" size={14} color="#fff" />
                        </Pressable>
                      </View>
                    )}
                    {/* P4: Inline calendar picker */}
                    {showCalendar && (
                      <View
                        style={[
                          styles.calendarContainer,
                          { borderBottomColor: colors.border },
                        ]}
                      >
                        <ScrollView style={{ maxHeight: 320 }}>
                          {/* Simple date grid - using day buttons for the current month */}
                          <View style={styles.calendarGrid}>
                            {(() => {
                              const now = new Date();
                              const daysInRange: string[] = [];
                              for (let i = 0; i < range; i++) {
                                const d = new Date(now);
                                d.setDate(d.getDate() - i);
                                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                                daysInRange.push(key);
                              }
                              return daysInRange.map((dateKey) => {
                                const [y, m, d] = dateKey
                                  .split("-")
                                  .map(Number);
                                const date = new Date(y, m - 1, d);
                                const isSelected = selectedDate === dateKey;
                                const dayLabel = date.toLocaleDateString(
                                  "fr-FR",
                                  {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                  },
                                );
                                return (
                                  <Pressable
                                    key={dateKey}
                                    style={[
                                      styles.calendarDayButton,
                                      { borderColor: colors.border },
                                      isSelected && {
                                        backgroundColor: colors.tint,
                                        borderColor: colors.tint,
                                      },
                                    ]}
                                    onPress={() => handleDateSelect(dateKey)}
                                  >
                                    <Text
                                      style={[
                                        styles.calendarDayText,
                                        { color: colors.text },
                                        isSelected && {
                                          color:
                                            colorScheme === "dark"
                                              ? Colors[colorScheme].background
                                              : "#fff",
                                        },
                                      ]}
                                    >
                                      {dayLabel}
                                    </Text>
                                  </Pressable>
                                );
                              });
                            })()}
                          </View>
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}
                renderTabs={() => (
                  <View
                    style={[
                      styles.stickyFilters,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <View style={styles.filterScrollContainer}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterRow}
                      >
                        {/* "Tous" toggle chip */}
                        <TouchableOpacity
                          style={[
                            styles.filterChip,
                            { borderColor: colors.tint, borderWidth: 0 },
                            allSelected && {
                              backgroundColor: `${colors.tint}1A`,
                            },
                          ]}
                          onPress={handleToggleAll}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={
                            allSelected
                              ? "Désélectionner tous les filtres"
                              : "Sélectionner tous les filtres"
                          }
                          accessibilityState={{ selected: allSelected }}
                        >
                          <Ionicons
                            name={
                              allSelected
                                ? "checkmark-circle"
                                : "ellipse-outline"
                            }
                            size={14}
                            color={allSelected ? colors.tint : colors.secondary}
                          />
                          <Text
                            style={[
                              styles.filterChipText,
                              {
                                color: allSelected
                                  ? colors.tint
                                  : colors.secondary,
                              },
                            ]}
                          >
                            Tous
                          </Text>
                        </TouchableOpacity>

                        {ALL_FILTERS.map((type) => (
                          <FilterChip
                            key={type}
                            type={type}
                            isActive={selectedTypes.includes(type)}
                            textColor={colors.text}
                            count={filterCounts[type]}
                            onPress={() => handleFilterToggle(type)}
                          />
                        ))}
                      </ScrollView>

                      {/* Fade gradient right edge */}
                      <LinearGradient
                        colors={[`${colors.surface}00`, colors.surface]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.filterFadeRight}
                        pointerEvents="none"
                      />
                    </View>
                  </View>
                )}
                stickyTabs
                style={styles.listPadding}
                ListFooterComponent={
                  sections.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons
                        name="calendar-outline"
                        size={64}
                        color={colors.secondary}
                      />
                      <Text
                        style={[styles.emptyText, { color: colors.secondary }]}
                      >
                        {selectedTypes.length === 0
                          ? "Sélectionnez au moins un type pour afficher la timeline."
                          : "Aucun événement pour ces filtres."}
                      </Text>
                    </View>
                  ) : null
                }
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
      <ConfirmModal
        visible={deleteConfirm.visible}
        title="Supprimer cet événement ?"
        message="Cette action est irréversible."
        confirmText="Supprimer"
        backgroundColor={colors.background}
        textColor={colors.text}
        confirmButtonColor={nc.error}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </ThemedView>
  );
}
