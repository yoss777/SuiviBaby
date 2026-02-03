import { ThemedView } from "@/components/themed-view";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { InfoModal } from "@/components/ui/InfoModal";
import { MOMENT_REPAS_LABELS } from "@/constants/dashboardConfig";
import { eventColors } from "@/constants/eventColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ecouterEvenementsHybrid } from "@/migration/eventsHybridService";
import type { Event, EventType } from "@/services/eventsService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
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
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { StickyHeaderSectionList } from "react-native-sticky-parallax-header";
import { useHeaderRight } from "../../_layout";

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
  kind?: "filters" | "day";
};

// ============================================
// CENTRALIZED CONFIGS
// ============================================

const STORAGE_KEY = "chrono_filters_v1";

// Activity type labels
const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  tummyTime: "Tummy Time",
  jeux: "Jeux",
  lecture: "Lecture",
  promenade: "Promenade",
  massage: "Massage",
  musique: "Musique",
  eveil: "Éveil sensoriel",
  sortie: "Sortie",
  autre: "Autre",
};

const JALON_TYPE_LABELS: Record<string, string> = {
  dent: "Première dent",
  pas: "Premiers pas",
  sourire: "Premier sourire",
  mot: "Premiers mots",
  humeur: "Humeur du jour",
  photo: "Moment photo",
  autre: "Autre moment",
};

const MOOD_EMOJIS: Record<number, string> = {
  1: "😢",
  2: "😐",
  3: "🙂",
  4: "😄",
  5: "🥰",
};

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
  solide: {
    color: "#8BC34A",
    label: "Repas solide",
    short: "Solide",
    icon: { lib: "fa6", name: "bowl-food" },
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
  bain: {
    color: "#3b82f6",
    label: "Bain",
    short: "Bain",
    icon: { lib: "fa6", name: "bath" },
  },
  temperature: {
    color: "#e03131",
    label: "Température",
    short: "Temp",
    icon: { lib: "fa6", name: "temperature-half" },
  },
  medicament: {
    color: "#2f9e44",
    label: "Médicament",
    short: "Médoc",
    icon: { lib: "fa6", name: "pills" },
  },
  symptome: {
    color: "#f59f00",
    label: "Symptôme",
    short: "Sympt.",
    icon: { lib: "fa6", name: "virus" },
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
  activite: {
    color: "#10b981",
    label: "Activité",
    short: "Activité",
    icon: { lib: "fa6", name: "play-circle" },
  },
  jalon: {
    color: eventColors.jalon.dark,
    label: "Jalon",
    short: "Jalon",
    icon: { lib: "fa6", name: "star" },
  },
  croissance: {
    color: "#8BCF9B",
    label: "Croissance",
    short: "Croiss.",
    icon: { lib: "fa6", name: "seedling" },
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
    eventTypes: ["sommeil", "bain"],
  },
  immunos: {
    label: "Santé",
    icon: "prescription-bottle",
    color: "#9C27B0",
    eventTypes: ["vitamine", "vaccin", "temperature", "medicament", "symptome"],
  },
  diapers: {
    label: "Couches",
    icon: "toilet",
    color: "#17a2b8",
    eventTypes: ["miction", "selle"],
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

const BIBERON_TYPE_LABELS: Record<string, string> = {
  lait_maternel: "Lait maternel",
  lait_infantile: "Lait infantile",
  eau: "Eau",
  jus: "Jus",
  autre: "Autre",
};
const SOLIDE_TYPE_LABELS: Record<string, string> = {
  puree: "Purée",
  compote: "Compote",
  cereales: "Céréales",
  yaourt: "Yaourt",
  morceaux: "Morceaux",
  autre: "Autre",
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
      const momentLabel = event.momentRepas
        ? MOMENT_REPAS_LABELS[event.momentRepas]
        : null;
      const quantity = event.quantiteSolide ?? event.quantite;
      const line2 =
        momentLabel || quantity
          ? `${momentLabel ?? ""}${momentLabel && quantity ? " · " : ""}${quantity ?? ""}`
          : null;
      const dishName = event.nomNouvelAliment || event.ingredients || "";
      const likeLabel =
        event.aime === undefined
          ? null
          : event.aime
            ? dishName
              ? `A aimé ce plat : ${dishName}`
              : "A aimé son plat"
            : dishName
              ? `N'a pas aimé ce plat : ${dishName}`
              : "N'a pas aimé le plat";
      const line3 = likeLabel || null;
      const parts = [line2, line3].filter(Boolean);
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
    case "sommeil":
      const start = event.heureDebut
        ? toDate(event.heureDebut)
        : toDate(event.date);
      const end = event.heureFin ? toDate(event.heureFin) : null;
      const duration =
        event.duree ??
        (end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0);

      const parts = [
        end ? formatDuration(duration) : null, // Only show duration if sleep is finished
        event.location,
        event.quality,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;

    case "bain": {
      const parts = [
        event.duree ? `${event.duree} min` : null,
        event.temperatureEau ? `${event.temperatureEau}°C` : null,
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
        event.duree ? `${event.duree} min` : null,
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
          { borderColor: config.color },
          // !isActive &&
          { borderWidth: 0 },
          isActive && { backgroundColor: `${config.color}1A` },
        ]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <FontAwesome name={config.icon as any} size={12} color={config.color} />
        <Text style={[styles.filterChipText, { color: textColor }]}>
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
  compact?: boolean;
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
    compact = false,
  }: RangeChipProps) => (
    <TouchableOpacity
      style={[
        styles.rangeChip,
        compact && styles.rangeChipCompact,
        { borderColor },
        isActive && { backgroundColor: "#f8f9fa" },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text
        style={[
          styles.rangeChipText,
          compact && styles.rangeChipTextCompact,
          { color: isActive ? tintColor : "#999999" },
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
  onLongPress: () => void;
  currentTime: Date;
}

const TimelineCard = React.memo(
  ({
    event,
    borderColor,
    backgroundColor,
    textColor,
    secondaryTextColor,
    onLongPress,
    currentTime,
  }: TimelineCardProps) => {
    const date = toDate(event.date);
    const details = buildDetails(event);
    const config = EVENT_CONFIG[event.type];
    const isSleep = event.type === "sommeil";
    const isActivity = event.type === "activite";
    const isJalon = event.type === "jalon";
    const isSolide = event.type === "solide";

    const solideMomentLabel = isSolide
      ? event.momentRepas
        ? MOMENT_REPAS_LABELS[event.momentRepas]
        : null
      : null;
    const solideQuantity = isSolide ? event.quantiteSolide ?? event.quantite : null;
    const solideLine2 =
      isSolide && (solideMomentLabel || solideQuantity)
        ? `${solideMomentLabel ?? ""}${
            solideMomentLabel && solideQuantity ? " · " : ""
          }${solideQuantity ?? ""}`
        : null;
    const solideDishName = isSolide
      ? event.nomNouvelAliment || event.ingredients || ""
      : "";
    const solideLikeLabel =
      isSolide && event.aime !== undefined
        ? event.aime
          ? solideDishName
            ? `A aimé ce plat : ${solideDishName}`
            : "A aimé ce plat"
          : solideDishName
            ? `N'a pas aimé ce plat : ${solideDishName}`
            : "N'a pas aimé ce plat"
        : null;
    const solideLikeColor =
      isSolide && event.aime !== undefined
        ? event.aime
          ? "#16a34a"
          : "#dc2626"
        : undefined;

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

    // Calculate elapsed time for ongoing sleep
    const isOngoingSleep = isSleep && !event.heureFin && event.heureDebut;
    const elapsedMinutes = isOngoingSleep
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
          <View style={[styles.line, { backgroundColor: borderColor }]} />
        </View>
        <View style={styles.cardTimeLeft}>
          {isSleep && event.heureFin ? (
            <>
              <Text
                style={[styles.cardTimeText, { color: secondaryTextColor }]}
              >
                {formatTime(date)}
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
          ) : isSleep && !event.heureFin ? (
            <>
              <Text
                style={[styles.cardTimeText, { color: secondaryTextColor }]}
              >
                {formatTime(date)}
              </Text>
              <Text
                style={[styles.cardTimeArrow, { color: secondaryTextColor }]}
              >
                ↓
              </Text>
              <Text
                style={[
                  styles.cardTimeOngoing,
                  { color: eventColors.sommeil.dark },
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
          activeOpacity={0.9}
          delayLongPress={250}
          onLongPress={onLongPress}
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
              {/* {moodEmoji ? (
                <Text style={styles.cardMoodEmoji}>{moodEmoji}</Text>
              ) : null} */}
            </View>
            <View style={styles.cardHeaderActions}>
              {isJalon && event.photos?.[0] ? (
                <Image
                  source={{ uri: event.photos[0] }}
                  style={styles.cardThumb}
                />
              ) : null}
              <FontAwesome
                name="pen-to-square"
                size={14}
                color={secondaryTextColor}
              />
            </View>
          </View>
          {!isSolide && (details || isOngoingSleep) && (
            <Text style={[styles.cardDetails, { color: secondaryTextColor }]}>
              {isOngoingSleep
                ? details
                  ? `${formatDuration(elapsedMinutes)} · ${details}`
                  : formatDuration(elapsedMinutes)
                : details}
            </Text>
          )}
          {isSolide && (solideLine2 || solideLikeLabel) && (
            <View style={styles.solideDetails}>
              {solideLine2 && (
                <Text style={[styles.solideDetailsText, { color: secondaryTextColor }]}>
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

// ============================================
// MAIN COMPONENT
// ============================================

export default function ChronoScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const { openSheet: openSheetRaw } = useSheet();
  const colorScheme = useColorScheme() ?? "light";
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
  const [showRangeInHeader, setShowRangeInHeader] = useState(false);
  const [headerRangeVisible, setHeaderRangeVisible] = useState(false);
  const showRangeRef = useRef(false);
  const headerHeight = useSharedValue(0);
  const headerScrollState = useSharedValue(0);
  const headerOwnerId = useRef(`chrono-${Math.random().toString(36).slice(2)}`);
  const headerRangeOpacity = useRef(new Animated.Value(0)).current;

  const triggerRefresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const openSheet = useCallback(
    (props: Parameters<typeof openSheetRaw>[0]) => {
      openSheetRaw({
        ...props,
        onSuccess: () => {
          props.onSuccess?.();
          triggerRefresh();
        },
      });
    },
    [openSheetRaw, triggerRefresh],
  );

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

  const updateHeaderRangeVisibility = useCallback((next: boolean) => {
    if (showRangeRef.current === next) return;
    showRangeRef.current = next;
    setShowRangeInHeader(next);
  }, []);

  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (Math.abs(headerHeight.value - height) > 1) {
      headerHeight.value = height;
    }
  }, []);

  const handleScroll = useCallback(
    (event: { contentOffset: { y: number } }) => {
      "worklet";
      if (headerHeight.value <= 0) {
        return;
      }
      const threshold = Math.max(headerHeight.value - 1, 0);
      const next = event.contentOffset.y >= threshold ? 1 : 0;
      if (headerScrollState.value !== next) {
        headerScrollState.value = next;
        runOnJS(updateHeaderRangeVisibility)(next === 1);
      }
    },
    [updateHeaderRangeVisibility],
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

    return events.filter(
      (event) =>
        effectiveTypes.has(event.type) && toDate(event.date) >= rangeStart,
    );
  }, [events, selectedTypes, range, currentDay]);

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
      // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  useEffect(() => {
    if (showRangeInHeader) {
      if (!headerRangeVisible) {
        setHeaderRangeVisible(true);
      }
      Animated.timing(headerRangeOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(headerRangeOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setHeaderRangeVisible(false);
      }
    });
  }, [headerRangeOpacity, headerRangeVisible, showRangeInHeader]);

  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <Animated.View
          style={[styles.headerRangeRow, { opacity: headerRangeOpacity }]}
          pointerEvents={headerRangeVisible ? "auto" : "none"}
        >
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
              compact
            />
          ))}
        </Animated.View>
      );

      setHeaderRight(headerButtons, headerOwnerId.current);

      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [
      colors,
      handleRangeChange,
      headerRangeOpacity,
      headerRangeVisible,
      range,
      setHeaderRight,
    ]),
  );

  const handleFilterToggle = useCallback((type: FilterType) => {
    // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((value) => value !== type)
        : [...prev, type],
    );
  }, []);

  const handleEdit = useCallback(
    (event: Event) => {
      if (!event.id) {
        setInfoModalMessage("Cet evenement ne peut pas etre modifie ici.");
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
      setInfoModalMessage("Cet evenement ne peut pas etre modifie ici.");
    },
    [openSheet],
  );

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
          backgroundColor={"#f8f9fa"}
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
        currentTime={currentTime}
      />
    ),
    [colors, handleEventLongPress, currentTime],
  );

  // Key extractor
  const keyExtractor = useCallback(
    (item: Event) => item.id || `${item.type}-${item.date}`,
    [],
  );

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        {/* Content */}
        <View style={styles.content}>
          {loading || (!emptyDelayDone && sections.length === 0) ? (
            <View style={styles.loading}>
              <IconPulseDots color={colors.tint} />
              <Text style={[styles.loadingText, { color: colors.secondary }]}>
                Chargement de la timeline...
              </Text>
            </View>
          ) : (
            <Animated.View style={[styles.listWrapper, { opacity: fadeAnim }]}>
              <StickyHeaderSectionList
                sections={sections}
                keyExtractor={keyExtractor}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                onHeaderLayout={handleHeaderLayout}
                onScroll={handleScroll}
                scrollEventThrottle={16}
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
                containerStyle={styles.stickyContainer}
                renderHeader={() => (
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
                )}
                renderTabs={() => (
                  <View style={styles.stickyFilters}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.filterRow}
                    >
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
                    </ScrollView>
                  </View>
                )}
                stickyTabs
                style={styles.listPadding}
                ListFooterComponent={
                  sections.length === 0 ? (
                    <View style={styles.emptyState}>
                      <View
                        style={[
                          styles.emptyIconCircle,
                          { borderColor: colors.border },
                        ]}
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
                      <Text
                        style={[styles.emptyText, { color: colors.secondary }]}
                      >
                        {selectedTypes.length === 0
                          ? "Selectionnez au moins un type pour afficher la timeline."
                          : "Aucun evenement pour ces filtres."}
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
    </ThemedView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  safeArea: {
    flex: 1,
  },
  stickyContainer: {
    paddingTop: 0,
    backgroundColor: "#f8f9fa",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: HEADER_SPACING,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  headerRangeRow: {
    flexDirection: "row",
    gap: 6,
    marginRight: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e1e4e8",
    borderRadius: 20,
    padding: 4,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    // borderWidth: 1,
    // backgroundColor: "#f8f9fa",
  },
  rangeChipCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  rangeChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  rangeChipTextCompact: {
    fontSize: 12,
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
    backgroundColor: "#f8f9fa",
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
    paddingTop: LIST_PADDING_TOP,
  },
  listContentEmpty: {
    flexGrow: 1,
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
  cardHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardThumb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#f1f3f5",
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sleepInlineIcon: {
    minWidth: 28,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  cardMoodEmoji: {
    fontSize: 16,
  },
  cardTime: {
    fontSize: 12,
    fontWeight: "600",
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
