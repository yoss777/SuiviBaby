import { getChartColors, getNeutralColors } from "@/constants/dashboardColors";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import {
  Canvas,
  Group,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  Shadow,
  Skia,
  Line as SkiaLine,
  vec,
} from "@shopify/react-native-skia";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Timestamp } from "firebase/firestore";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type Props = {
  tetees: any[];
  initialTypeFilter?: "tous" | "seins" | "biberons" | "solides";
  colorScheme?: "light" | "dark";
  screenWidth?: number;
};

const DEFAULT_SCREEN_WIDTH = Dimensions.get("window").width - 40;
const CHART_HEIGHT = 210;
const CHART_PADDING = { top: 18, right: 18, bottom: 46, left: 50 };

const TAP_HINT_KEY = "tetees_chart_tap_hint_shown";

const SOLIDE_TYPES = ["puree", "compote", "cereales", "yaourt", "morceaux", "autre"] as const;
type SolideType = (typeof SOLIDE_TYPES)[number];
const SOLIDE_LABELS: Record<SolideType, string> = {
  puree: "Purées",
  compote: "Compotes",
  cereales: "Céréales",
  yaourt: "Yaourts",
  morceaux: "Morceaux",
  autre: "Autre",
};

function getSolideColors(scheme: "light" | "dark"): Record<SolideType, string> {
  if (scheme === "dark") {
    return {
      puree: "#fb923c",
      compote: "#f87171",
      cereales: "#fbbf24",
      yaourt: "#a78bfa",
      morceaux: "#f97316",
      autre: "#9ca3af",
    };
  }
  return {
    puree: "#E89A5A",
    compote: "#E8785A",
    cereales: "#D4A574",
    yaourt: "#A78BFA",
    morceaux: "#C97B3A",
    autre: "#9ca3af",
  };
}

function getStartOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const dayOfWeek = day === 0 ? 7 : day;
  const diff = dayOfWeek - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addWeeks(date: Date, weeks: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

/** Build a Skia path for a rect with per-corner radii */
function makeRRect(
  x: number, y: number, w: number, h: number,
  topLeft: number, topRight: number, bottomRight: number, bottomLeft: number,
) {
  const path = Skia.Path.Make();
  path.addRRect({
    rect: { x, y, width: w, height: h },
    topLeft: { x: topLeft, y: topLeft },
    topRight: { x: topRight, y: topRight },
    bottomRight: { x: bottomRight, y: bottomRight },
    bottomLeft: { x: bottomLeft, y: bottomLeft },
  });
  return path;
}

export default function RepasChart({
  tetees,
  initialTypeFilter,
  colorScheme = "light",
  screenWidth: screenWidthProp,
}: Props) {
  const SCREEN_WIDTH = screenWidthProp ?? DEFAULT_SCREEN_WIDTH;
  const CHART_WIDTH = SCREEN_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const C = getChartColors(colorScheme).tetees;
  const nc = getNeutralColors(colorScheme);

  const [viewMode, setViewMode] = useState<"quantity" | "frequency">(
    "frequency",
  );
  const [typeFilter, setTypeFilter] = useState<"tous" | "seins" | "biberons" | "solides">(
    initialTypeFilter ?? "tous",
  );
  const [currentWeek, setCurrentWeek] = useState<Date>(
    getStartOfWeek(new Date()),
  );
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [isGroupedView, setIsGroupedView] = useState(false);
  const [showTapHint, setShowTapHint] = useState(false);

  const tooltipX = useSharedValue(0);
  const tooltipY = useSharedValue(0);

  // Animated filter indicators
  const TYPE_FILTER_KEYS = ["tous", "seins", "biberons", "solides"] as const;
  const typeFilterIndex = useSharedValue(
    TYPE_FILTER_KEYS.indexOf(initialTypeFilter ?? "tous"),
  );
  const [typeTabsWidth, setTypeTabsWidth] = useState(0);
  const typeTabWidth =
    typeTabsWidth > 0 ? (typeTabsWidth - 8 - 18) / 4 : 0; // 8=padding*2, 18=gap*3
  const animatedTypeIndicator = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withTiming(
          4 + typeFilterIndex.value * (typeTabWidth + 6),
          { duration: 250 },
        ),
      },
    ],
    width: typeTabWidth,
  }));

  const viewModeIndex = useSharedValue(1); // 0=quantity, 1=frequency
  const savedViewModes = useRef<Record<string, "quantity" | "frequency">>({
    tous: "frequency",
    biberons: "frequency",
  });
  const [viewTabsWidth, setViewTabsWidth] = useState(0);
  const showBothViewModes =
    typeFilter !== "seins" && typeFilter !== "solides";
  const viewTabWidth =
    viewTabsWidth > 0 ? (viewTabsWidth - 8 - 6) / 2 : 0; // 8=padding*2, 6=gap
  const animatedViewIndicator = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withTiming(
          4 + viewModeIndex.value * (viewTabWidth + 6),
          { duration: 250 },
        ),
      },
    ],
    width: viewTabWidth,
  }));

  const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  useEffect(() => {
    AsyncStorage.getItem(TAP_HINT_KEY).then((val) => {
      if (!val) setShowTapHint(true);
    });
  }, []);

  useEffect(() => {
    if (initialTypeFilter && initialTypeFilter !== typeFilter) {
      setTypeFilter(initialTypeFilter);
      typeFilterIndex.value = TYPE_FILTER_KEYS.indexOf(initialTypeFilter);
      if (initialTypeFilter === "seins" || initialTypeFilter === "solides") {
        setViewMode("frequency");
        viewModeIndex.value = 0;
      }
    }
  }, [initialTypeFilter]);

  // Switch type filter with synced viewMode (batched in same render, no desync frame)
  const switchTypeFilter = useCallback((newFilter: "tous" | "seins" | "biberons" | "solides") => {
    setTypeFilter(newFilter);
    typeFilterIndex.value = TYPE_FILTER_KEYS.indexOf(newFilter);
    if (newFilter === "seins" || newFilter === "solides") {
      setViewMode("frequency");
      viewModeIndex.value = 0;
    } else {
      const restored = savedViewModes.current[newFilter] ?? "frequency";
      setViewMode(restored);
      viewModeIndex.value = restored === "quantity" ? 0 : 1;
    }
  }, []);

  useEffect(() => {
    setSelectedBarIndex(null);
  }, [currentWeek, viewMode, typeFilter]);

  const isEmpty = !tetees || tetees.length === 0;

  const start = getStartOfWeek(currentWeek);
  const end = addWeeks(start, 1);

  const filteredTetees = tetees.filter((t) => {
    if (typeFilter === "tous") return true;
    const type = t.type || "seins";
    if (typeFilter === "seins") {
      return type === "seins" || type === "tetee" || !t.type;
    }
    if (typeFilter === "biberons") {
      return type === "biberons" || type === "biberon";
    }
    if (typeFilter === "solides") {
      return type === "solide";
    }
    return false;
  });

  const solideColors = useMemo(() => getSolideColors(colorScheme), [colorScheme]);

  type DayData = {
    quantity: number;
    count: number;
    seinsCount: number;
    biberonsCount: number;
    biberonsQuantity: number;
    solidesCount: number;
    solidesByType: Record<SolideType, number>;
  };
  const emptyDay = (): DayData => ({
    quantity: 0,
    count: 0,
    seinsCount: 0,
    biberonsCount: 0,
    biberonsQuantity: 0,
    solidesCount: 0,
    solidesByType: { puree: 0, compote: 0, cereales: 0, yaourt: 0, morceaux: 0, autre: 0 },
  });
  const weeklyData: Record<string, DayData> = {
    Lun: emptyDay(), Mar: emptyDay(), Mer: emptyDay(), Jeu: emptyDay(),
    Ven: emptyDay(), Sam: emptyDay(), Dim: emptyDay(),
  };

  filteredTetees.forEach((t) => {
    const d = t.date instanceof Timestamp ? t.date.toDate() : new Date(t.date);
    if (d >= start && d < end) {
      const jour = d.toLocaleDateString("fr-FR", { weekday: "short" });
      const jourKey = jour.charAt(0).toUpperCase() + jour.slice(1, 3);
      const type = t.type || "seins";
      const quantite = t.quantite || 0;

      if (weeklyData[jourKey]) {
        weeklyData[jourKey].count += 1;
        if (type === "seins" || type === "tetee" || !t.type) {
          weeklyData[jourKey].seinsCount += 1;
        } else if (type === "biberons" || type === "biberon") {
          weeklyData[jourKey].biberonsCount += 1;
          weeklyData[jourKey].biberonsQuantity += quantite;
          weeklyData[jourKey].quantity += quantite;
        } else if (type === "solide") {
          weeklyData[jourKey].solidesCount += 1;
          const ts = (t.typeSolide || "autre") as SolideType;
          const validTs = SOLIDE_TYPES.includes(ts) ? ts : "autre";
          weeklyData[jourKey].solidesByType[validTs] += 1;
        }
      }
    }
  });

  const quantityValues = jours.map((j) => weeklyData[j].quantity);
  const countValues = jours.map((j) => weeklyData[j].count);

  const totalWeekQuantity = quantityValues.reduce((acc, v) => acc + v, 0);
  const totalWeekCount = countValues.reduce((acc, v) => acc + v, 0);
  const totalSeinsCount = jours.reduce(
    (acc, j) => acc + weeklyData[j].seinsCount,
    0,
  );
  const totalBiberonsCount = jours.reduce(
    (acc, j) => acc + weeklyData[j].biberonsCount,
    0,
  );
  const totalSolidesCount = jours.reduce(
    (acc, j) => acc + weeklyData[j].solidesCount,
    0,
  );
  const totalCountLabel =
    typeFilter === "tous"
      ? "Repas"
      : typeFilter === "biberons"
        ? "Biberon"
        : typeFilter === "solides"
          ? "Solide"
          : "Tétée";
  const frequencyUnit =
    typeFilter === "tous"
      ? "repas"
      : typeFilter === "biberons"
        ? "biberons"
        : typeFilter === "solides"
          ? "solides"
          : "tétées";
  const recordLabel =
    typeFilter === "tous"
      ? "Record: repas"
      : typeFilter === "biberons"
        ? "Record: biberon"
        : typeFilter === "solides"
          ? "Record: solide"
          : "Record: tétée";

  const daysWithCount = countValues.filter((v) => v > 0).length;
  const daysWithQuantity = quantityValues.filter((v) => v > 0).length;
  const countAverageLabel = `Moyenne/jour (${daysWithCount}j)`;
  const quantityAverageLabel = `Moyenne/jour (${daysWithQuantity}j)`;

  const dailyAverageQuantity =
    totalWeekQuantity > 0 && daysWithQuantity > 0
      ? Math.round(totalWeekQuantity / daysWithQuantity)
      : 0;
  const dailyAverageCount =
    totalWeekCount > 0 && daysWithCount > 0
      ? Math.round((totalWeekCount / daysWithCount) * 10) / 10
      : 0;

  const maxQuantity = Math.max(...quantityValues, 0);
  const maxCount = Math.max(...countValues, 0);
  const bestQuantityDay = jours[quantityValues.indexOf(maxQuantity)];
  const bestCountDay = jours[countValues.indexOf(maxCount)];
  const maxSeinsCount = Math.max(
    ...jours.map((j) => weeklyData[j].seinsCount),
    0,
  );
  const maxBiberonsCount = Math.max(
    ...jours.map((j) => weeklyData[j].biberonsCount),
    0,
  );
  const maxSolidesCount = Math.max(
    ...jours.map((j) => weeklyData[j].solidesCount),
    0,
  );

  // Solide type totals for the week
  const solideTypeTotals = useMemo(() => {
    const totals: Record<SolideType, number> = { puree: 0, compote: 0, cereales: 0, yaourt: 0, morceaux: 0, autre: 0 };
    jours.forEach((j) => {
      SOLIDE_TYPES.forEach((st) => {
        totals[st] += weeklyData[j].solidesByType[st];
      });
    });
    return totals;
  }, [weeklyData]);

  // New foods introduced this week
  const newFoodsThisWeek = useMemo(() => {
    return filteredTetees.filter((t) => {
      if (t.type !== "solide") return false;
      const d = t.date instanceof Timestamp ? t.date.toDate() : new Date(t.date);
      return d >= start && d < end && t.nouveauAliment;
    });
  }, [filteredTetees, start, end]);

  // Favorite solide type
  const favoriteSolideType = useMemo(() => {
    const entries = Object.entries(solideTypeTotals).filter(([_, v]) => v > 0) as [SolideType, number][];
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }, [solideTypeTotals]);

  // Reactions this week
  const reactionsThisWeek = useMemo(() => {
    return filteredTetees.filter((t) => {
      if (t.type !== "solide") return false;
      const d = t.date instanceof Timestamp ? t.date.toDate() : new Date(t.date);
      return d >= start && d < end && t.reaction && t.reaction !== "aucune";
    }).length;
  }, [filteredTetees, start, end]);

  const groupedMax = Math.max(maxSeinsCount, maxBiberonsCount, maxSolidesCount, 0);
  const currentValues = viewMode === "quantity" ? quantityValues : countValues;
  const isGrouped =
    typeFilter === "tous" && viewMode === "frequency" && isGroupedView;
  const isStacked =
    typeFilter === "tous" && viewMode === "frequency" && !isGroupedView;
  const currentMax =
    viewMode === "quantity" ? maxQuantity : isGrouped ? groupedMax : maxCount;

  const barWidth = CHART_WIDTH / (jours.length * 1.45);
  const barSpacing = barWidth / 2.2;
  const chartAreaHeight =
    CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const bars = useMemo(() => {
    return jours.map((jour, index) => {
      const value = currentValues[index];
      const x = CHART_PADDING.left + index * (barWidth + barSpacing);

      if (isGrouped) {
        const total = countValues[index];
        const seins = weeklyData[jour].seinsCount;
        const biberons = weeklyData[jour].biberonsCount;
        const solides = weeklyData[jour].solidesCount;
        const biberonsHeight =
          currentMax > 0 ? (biberons / currentMax) * chartAreaHeight : 0;
        const seinsHeight =
          currentMax > 0 ? (seins / currentMax) * chartAreaHeight : 0;
        const solidesHeight =
          currentMax > 0 ? (solides / currentMax) * chartAreaHeight : 0;
        const baseY = CHART_PADDING.top + chartAreaHeight;
        const topY = baseY - Math.max(biberonsHeight, seinsHeight, solidesHeight, 2);

        return {
          jour,
          value: total,
          x,
          width: barWidth,
          y: topY,
          height: Math.max(Math.max(biberonsHeight, seinsHeight, solidesHeight), 2),
          isMax: total === maxCount && total > 0,
          segments: {
            biberonsHeight,
            seinsHeight,
            solidesHeight,
          },
        };
      }

      if (isStacked) {
        const total = countValues[index];
        const seins = weeklyData[jour].seinsCount;
        const biberons = weeklyData[jour].biberonsCount;
        const solides = weeklyData[jour].solidesCount;
        const totalParts = seins + biberons + solides;
        const barHeight =
          currentMax > 0 ? (total / currentMax) * chartAreaHeight : 0;
        const biberonsHeight =
          totalParts > 0 ? (biberons / totalParts) * barHeight : 0;
        const seinsHeight =
          totalParts > 0 ? (seins / totalParts) * barHeight : 0;
        const solidesHeight =
          totalParts > 0 ? (solides / totalParts) * barHeight : 0;
        const baseY = CHART_PADDING.top + chartAreaHeight;

        return {
          jour,
          value: total,
          x,
          width: barWidth,
          y: baseY - barHeight,
          height: Math.max(barHeight, 2),
          isMax: total === currentMax && total > 0,
          segments: {
            biberonsHeight,
            seinsHeight,
            solidesHeight,
          },
        };
      }

      // Solides stacked by typeSolide
      if (typeFilter === "solides" && value > 0) {
        const byType = weeklyData[jour].solidesByType;
        const barHeight = currentMax > 0 ? (value / currentMax) * chartAreaHeight : 0;
        const baseY = CHART_PADDING.top + chartAreaHeight;
        const solideSegments: { type: SolideType; height: number; color: string }[] = [];
        SOLIDE_TYPES.forEach((st) => {
          if (byType[st] > 0) {
            solideSegments.push({
              type: st,
              height: (byType[st] / value) * barHeight,
              color: solideColors[st],
            });
          }
        });

        return {
          jour,
          value,
          x,
          width: barWidth,
          y: baseY - barHeight,
          height: Math.max(barHeight, 2),
          isMax: value === currentMax && value > 0,
          solideSegments,
        };
      }

      const barHeight =
        currentMax > 0 ? (value / currentMax) * chartAreaHeight : 0;
      const y = CHART_PADDING.top + (chartAreaHeight - barHeight);

      let color = C.blue;
      if (value === 0) {
        color = C.emptyBar;
      } else if (typeFilter === "seins") {
        color = C.green;
      } else if (typeFilter === "biberons") {
        color = C.cyan;
      } else if (typeFilter === "solides") {
        color = C.orange;
      } else if (value === currentMax && value > 0) {
        color = C.gold;
      }

      return {
        jour,
        value,
        x,
        y,
        width: barWidth,
        height: Math.max(barHeight, 2),
        color,
        isMax: value === currentMax && value > 0,
      };
    });
  }, [
    barSpacing,
    barWidth,
    chartAreaHeight,
    countValues,
    currentMax,
    currentValues,
    groupedMax,
    isGrouped,
    isStacked,
    typeFilter,
    weeklyData,
    solideColors,
    C,
  ]);

  const yAxisLabels = useMemo(() => {
    const steps = 4;
    const maxValue = currentMax || 1;
    return Array.from({ length: steps }, (_, i) => {
      const value = Math.round((maxValue / (steps - 1)) * i);
      const y =
        CHART_PADDING.top +
        chartAreaHeight -
        (value / maxValue) * chartAreaHeight;
      return { value, y };
    });
  }, [currentMax]);

  const findBarAtPosition = (x: number) => {
    for (let i = 0; i < bars.length; i += 1) {
      const bar = bars[i];
      if (x >= bar.x && x <= bar.x + bar.width) {
        return i;
      }
    }
    return null;
  };

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => {
      if (showTapHint) {
        setShowTapHint(false);
        AsyncStorage.setItem(TAP_HINT_KEY, "1");
      }
      const barIndex = findBarAtPosition(event.x);
      if (barIndex !== null && bars[barIndex].value > 0) {
        setSelectedBarIndex((prev) => {
          if (prev === barIndex) {
            return null;
          }
          tooltipX.value = withSpring(
            bars[barIndex].x + bars[barIndex].width / 2 - 50,
          );
          tooltipY.value = withSpring(bars[barIndex].y - 60);
          return barIndex;
        });
      } else {
        setSelectedBarIndex(null);
      }
    });

  const animatedTooltipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tooltipX.value }, { translateY: tooltipY.value }],
  }));

  return (
    <GestureHandlerRootView
      style={[styles.container, { backgroundColor: nc.background }]}
    >
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="utensils" size={64} color={nc.textMuted} />
          <Text style={[styles.emptyTitle, { color: nc.textNormal }]}>
            Aucune donnée disponible
          </Text>
          <Text style={[styles.emptySubtitle, { color: nc.textLight }]}>
            Commencez à enregistrer des tétées pour voir les statistiques
          </Text>
          <TouchableOpacity
            style={[styles.emptyCta, { backgroundColor: C.blue }]}
            onPress={() => router.replace("/baby/chrono")}
            accessibilityRole="button"
            accessibilityLabel="Ajouter une tétée"
          >
            <FontAwesome name="plus" size={14} color="#ffffff" />
            <Text style={styles.emptyCtaText}>Ajouter une tétée</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={[
            styles.section,
            {
              backgroundColor: C.surface,
              shadowColor: colorScheme === "dark" ? "transparent" : "#000",
              borderColor:
                colorScheme === "dark" ? nc.border : "transparent",
              borderWidth: colorScheme === "dark" ? 1 : 0,
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View
              style={[styles.iconBadge, { backgroundColor: C.iconBadgeBg }]}
            >
              <FontAwesome name="utensils" size={18} color={C.blue} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.sectionTitle, { color: C.ink }]}>
                Statistiques des repas
              </Text>
              <Text style={[styles.sectionSubtitle, { color: C.muted }]}>
                {`${start.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })} - ${new Date(end.getTime() - 1).toLocaleDateString(
                  "fr-FR",
                  {
                    day: "numeric",
                    month: "short",
                  },
                )}`}
              </Text>
            </View>
          </View>

          <View style={styles.navigationRow}>
            <TouchableOpacity
              style={[
                styles.navButton,
                {
                  backgroundColor: C.navButtonBg,
                  borderColor: C.border,
                },
              ]}
              onPress={() => setCurrentWeek(addWeeks(currentWeek, -1))}
              accessibilityLabel="Semaine précédente"
            >
              <FontAwesome name="chevron-left" size={14} color={C.muted} />
              <Text style={[styles.navText, { color: C.muted }]}>Préc.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.todayButton, { backgroundColor: C.blue }]}
              onPress={() => setCurrentWeek(getStartOfWeek(new Date()))}
              accessibilityLabel="Revenir à cette semaine"
            >
              <Text style={styles.todayText}>Cette semaine</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.navButton,
                {
                  backgroundColor: C.navButtonBg,
                  borderColor: C.border,
                },
              ]}
              onPress={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              accessibilityLabel="Semaine suivante"
            >
              <Text style={[styles.navText, { color: C.muted }]}>Suiv.</Text>
              <FontAwesome name="chevron-right" size={14} color={C.muted} />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.typeFilterContainer,
              { backgroundColor: C.filterBg },
            ]}
            onLayout={(e) => setTypeTabsWidth(e.nativeEvent.layout.width)}
          >
            <Animated.View
              style={[
                styles.tabIndicator,
                {
                  backgroundColor: C.filterActiveBg,
                  borderColor: C.blue,
                  opacity: typeTabWidth > 0 ? 1 : 0,
                },
                animatedTypeIndicator,
              ]}
            />
            {[
              { key: "tous", label: "Tous", icon: "utensils" },
              { key: "seins", label: "Tétées", icon: "person-breastfeeding" },
              { key: "biberons", label: "Bib.", icon: "baby-bottle", iconType: "mc" as const },
              { key: "solides", label: "Solides", icon: "bowl-food" },
            ].map((type, index) => {
              const isActive = typeFilter === type.key;
              return (
                <TouchableOpacity
                  key={type.key}
                  style={styles.typeFilterButton}
                  onPress={() => {
                    switchTypeFilter(type.key as typeof typeFilter);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`Filtre ${type.label}`}
                >
                  {"iconType" in type && type.iconType === "mc" ? (
                    <MaterialCommunityIcons
                      name={type.icon as any}
                      size={16}
                      color={isActive ? C.blue : C.muted}
                    />
                  ) : (
                    <FontAwesome
                      name={type.icon}
                      size={16}
                      color={isActive ? C.blue : C.muted}
                    />
                  )}
                  <Text
                    style={[
                      styles.typeFilterLabel,
                      { color: C.muted },
                      isActive && { color: C.ink, fontWeight: "700" },
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View
            style={[
              styles.toggleContainer,
              { backgroundColor: C.filterBg },
            ]}
            onLayout={(e) => setViewTabsWidth(e.nativeEvent.layout.width)}
          >
            <Animated.View
              style={[
                styles.tabIndicator,
                {
                  backgroundColor: C.filterActiveBg,
                  borderColor: C.blue,
                  opacity: showBothViewModes && viewTabWidth > 0 ? 1 : 0,
                },
                animatedViewIndicator,
              ]}
            />
            {showBothViewModes && (
              <TouchableOpacity
                style={styles.toggleButton}
                onPress={() => {
                  viewModeIndex.value = 0;
                  setViewMode("quantity");
                  savedViewModes.current[typeFilter] = "quantity";
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: viewMode === "quantity" }}
              >
                <FontAwesome
                  name="droplet"
                  size={14}
                  color={viewMode === "quantity" ? C.blue : C.muted}
                />
                <Text
                  style={[
                    styles.toggleText,
                    { color: C.muted },
                    viewMode === "quantity" && { color: C.blue, fontWeight: "700" },
                  ]}
                >
                  Quantité
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.toggleButton,
                !showBothViewModes && [
                  styles.toggleButtonActive,
                  {
                    backgroundColor: C.filterActiveBg,
                    borderColor: C.blue,
                  },
                ],
              ]}
              onPress={() => {
                savedViewModes.current[typeFilter] = "frequency";
                viewModeIndex.value = showBothViewModes ? 1 : 0;
                setViewMode("frequency");
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: viewMode === "frequency" }}
            >
              <FontAwesome
                name="clock"
                size={14}
                color={viewMode === "frequency" ? C.blue : C.muted}
              />
              <Text
                style={[
                  styles.toggleText,
                  { color: C.muted },
                  viewMode === "frequency" && { color: C.blue, fontWeight: "700" },
                ]}
              >
                Fréquence
              </Text>
            </TouchableOpacity>
          </View>

          {totalWeekCount === 0 ? (
            <View style={styles.noDataContainer}>
              <FontAwesome name="chart-bar" size={24} color={C.muted} />
              <Text style={[styles.noDataText, { color: C.muted }]}>
                Aucune donnée cette semaine
              </Text>
            </View>
          ) : (
          <>
          <View style={styles.metricsRow}>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: C.metricBg, borderColor: C.border },
              ]}
            >
              <Text style={[styles.metricLabel, { color: C.muted }]}>
                {totalCountLabel}
                {totalCountLabel !== "Repas" && totalWeekCount > 1 ? "s" : ""}
              </Text>
              <Text style={[styles.metricValue, { color: C.blueDeep }]}>
                {totalWeekCount}
              </Text>
            </View>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: C.metricBg, borderColor: C.border },
              ]}
            >
              <Text style={[styles.metricLabel, { color: C.muted }]}>
                {countAverageLabel}
              </Text>
              <Text style={[styles.metricValue, { color: C.blueDeep }]}>
                {dailyAverageCount}
              </Text>
            </View>
            {viewMode === "quantity" && typeFilter !== "seins" && typeFilter !== "solides" && (
              <View
                style={[
                  styles.metricCard,
                  { backgroundColor: C.metricBg, borderColor: C.border },
                ]}
              >
                <Text style={[styles.metricLabel, { color: C.muted }]}>
                  Total lait
                </Text>
                <Text style={[styles.metricValue, { color: C.blueDeep }]}>
                  {totalWeekQuantity} ml
                </Text>
              </View>
            )}
          </View>
          {typeFilter === "tous" && viewMode === "frequency" && (
            <View style={styles.legendRow}>
              <View style={styles.legendList}>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendSwatch,
                      { backgroundColor: C.green },
                    ]}
                  />
                  <Text style={[styles.legendLabel, { color: C.muted }]}>
                    Tétées
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendSwatch,
                      { backgroundColor: C.cyan },
                    ]}
                  />
                  <Text style={[styles.legendLabel, { color: C.muted }]}>
                    Biberons
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendSwatch,
                      { backgroundColor: C.orange },
                    ]}
                  />
                  <Text style={[styles.legendLabel, { color: C.muted }]}>
                    Solides
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.groupToggle,
                  {
                    borderColor: C.border,
                    backgroundColor: C.metricBg,
                  },
                  isGrouped && {
                    backgroundColor: C.blue,
                    borderColor: C.blue,
                  },
                ]}
                onPress={() => setIsGroupedView((prev) => !prev)}
              >
                <Text
                  style={[
                    styles.groupToggleText,
                    { color: C.muted },
                    isGrouped && { color: "white" },
                  ]}
                >
                  Vue groupée
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {typeFilter === "solides" && totalSolidesCount > 0 && (
            <View style={styles.legendRow}>
              <View style={[styles.legendList, { flexWrap: "wrap" }]}>
                {SOLIDE_TYPES.filter((st) => solideTypeTotals[st] > 0).map((st) => (
                  <View key={st} style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: solideColors[st] }]} />
                    <Text style={[styles.legendLabel, { color: C.muted }]}>{SOLIDE_LABELS[st]}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.chartContainer}>
            <View style={styles.yAxisContainer}>
              {yAxisLabels.map((label, index) => (
                <View
                  key={index}
                  style={[styles.yAxisLabel, { top: label.y - 8 }]}
                >
                  <Text style={[styles.yAxisText, { color: C.muted }]}>
                    {label.value}
                  </Text>
                </View>
              ))}
            </View>

            <GestureDetector gesture={tapGesture}>
              <Canvas
                style={[styles.canvas, { width: SCREEN_WIDTH }]}
                accessibilityLabel="Graphique des tétées de la semaine. Appuyez sur une barre pour voir les détails."
              >
                <RoundedRect
                  x={CHART_PADDING.left}
                  y={CHART_PADDING.top}
                  width={CHART_WIDTH}
                  height={
                    CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
                  }
                  r={12}
                  color={C.surface}
                >
                  <LinearGradient
                    start={vec(CHART_PADDING.left, CHART_PADDING.top)}
                    end={vec(
                      CHART_PADDING.left,
                      CHART_HEIGHT - CHART_PADDING.bottom,
                    )}
                    colors={[C.gradientStart, C.gradientEnd]}
                  />
                </RoundedRect>

                {yAxisLabels.map((label, index) => (
                  <SkiaLine
                    key={`grid-${index}`}
                    p1={vec(CHART_PADDING.left, label.y)}
                    p2={vec(SCREEN_WIDTH - CHART_PADDING.right, label.y)}
                    color={C.gridLine}
                    strokeWidth={1}
                  />
                ))}

                {bars.map((bar, index) => {
                  if (isGrouped && bar.segments) {
                    const baseY = CHART_PADDING.top + chartAreaHeight;
                    const biberonsHeight = bar.segments.biberonsHeight;
                    const seinsHeight = bar.segments.seinsHeight;
                    const solidesHeight = bar.segments.solidesHeight ?? 0;
                    const groupGap = 2;
                    const subWidth = Math.max((bar.width - groupGap * 2) / 3, 2);
                    const seinsX = bar.x;
                    const biberonsX = bar.x + subWidth + groupGap;
                    const solidesX = bar.x + (subWidth + groupGap) * 2;
                    const seinsY = baseY - seinsHeight;
                    const biberonsY = baseY - biberonsHeight;
                    const solidesY = baseY - solidesHeight;
                    return (
                      <Group key={`bar-${index}`}>
                        {seinsHeight > 0 && (
                          <RoundedRect
                            x={seinsX}
                            y={seinsY}
                            width={subWidth}
                            height={Math.max(seinsHeight, 2)}
                            r={4}
                            color={C.green}
                          />
                        )}
                        {biberonsHeight > 0 && (
                          <RoundedRect
                            x={biberonsX}
                            y={biberonsY}
                            width={subWidth}
                            height={Math.max(biberonsHeight, 2)}
                            r={4}
                            color={C.cyan}
                          />
                        )}
                        {solidesHeight > 0 && (
                          <RoundedRect
                            x={solidesX}
                            y={solidesY}
                            width={subWidth}
                            height={Math.max(solidesHeight, 2)}
                            r={4}
                            color={C.orange}
                          >
                            {bar.isMax && (
                              <Shadow
                                dx={0}
                                dy={2}
                                blur={6}
                                color="rgba(234, 179, 8, 0.35)"
                              />
                            )}
                          </RoundedRect>
                        )}
                      </Group>
                    );
                  }

                  if (isStacked && bar.segments) {
                    const baseY = CHART_PADDING.top + chartAreaHeight;
                    const biberonsHeight = bar.segments.biberonsHeight;
                    const solidesHeight = bar.segments.solidesHeight ?? 0;
                    const seinsHeight = bar.segments.seinsHeight;
                    const biberonsY = baseY - biberonsHeight;
                    const solidesY = baseY - biberonsHeight - solidesHeight;
                    const seinsY = baseY - biberonsHeight - solidesHeight - seinsHeight;

                    // Determine which segments are visible for corner radius
                    const visibleSegments: { y: number; h: number; color: string }[] = [];
                    if (biberonsHeight > 0) visibleSegments.push({ y: biberonsY, h: Math.max(biberonsHeight, 2), color: C.cyan });
                    if (solidesHeight > 0) visibleSegments.push({ y: solidesY, h: Math.max(solidesHeight, 2), color: C.orange });
                    if (seinsHeight > 0) visibleSegments.push({ y: seinsY, h: Math.max(seinsHeight, 2), color: C.green });

                    const R = 6;
                    return (
                      <Group key={`bar-${index}`}>
                        {visibleSegments.map((seg, si) => {
                          const isBottom = si === 0;
                          const isTop = si === visibleSegments.length - 1;
                          if (isBottom && isTop) {
                            // Single segment: all corners rounded
                            return <RoundedRect key={si} x={bar.x} y={seg.y} width={bar.width} height={seg.h} r={R} color={seg.color} />;
                          }
                          const tl = isTop ? R : 0;
                          const tr = isTop ? R : 0;
                          const br = isBottom ? R : 0;
                          const bl = isBottom ? R : 0;
                          return <Path key={si} path={makeRRect(bar.x, seg.y, bar.width, seg.h, tl, tr, br, bl)} color={seg.color} />;
                        })}
                      </Group>
                    );
                  }

                  // Solides stacked by typeSolide
                  if ("solideSegments" in bar && bar.solideSegments) {
                    const baseY = CHART_PADDING.top + chartAreaHeight;
                    const segs = bar.solideSegments as { type: string; height: number; color: string }[];
                    const visibleSegs: { y: number; h: number; color: string }[] = [];
                    let curY = baseY;
                    segs.forEach((seg) => {
                      curY -= seg.height;
                      visibleSegs.push({ y: curY, h: Math.max(seg.height, 1), color: seg.color });
                    });
                    visibleSegs.reverse(); // bottom to top
                    const R = 6;
                    return (
                      <Group key={`bar-${index}`}>
                        {visibleSegs.map((seg, si) => {
                          const isBottom = si === 0;
                          const isTop = si === visibleSegs.length - 1;
                          if (isBottom && isTop) {
                            return <RoundedRect key={si} x={bar.x} y={seg.y} width={bar.width} height={seg.h} r={R} color={seg.color} />;
                          }
                          const tl = isTop ? R : 0;
                          const tr = isTop ? R : 0;
                          const br = isBottom ? R : 0;
                          const bl = isBottom ? R : 0;
                          return <Path key={si} path={makeRRect(bar.x, seg.y, bar.width, seg.h, tl, tr, br, bl)} color={seg.color} />;
                        })}
                      </Group>
                    );
                  }

                  return (
                    <RoundedRect
                      key={`bar-${index}`}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      r={6}
                      color={bar.color}
                    >
                      {bar.isMax && (
                        <Shadow
                          dx={0}
                          dy={2}
                          blur={6}
                          color="rgba(234, 179, 8, 0.35)"
                        />
                      )}
                    </RoundedRect>
                  );
                })}
              </Canvas>
            </GestureDetector>

            {showTapHint && totalWeekCount > 0 && (
              <View style={[styles.tapHint, { backgroundColor: C.tooltipBg, borderColor: C.tooltipBorder }]}>
                <FontAwesome name="hand-pointer" size={12} color={C.muted} />
                <Text style={[styles.tapHintText, { color: C.muted }]}>
                  Touchez une barre pour les détails
                </Text>
              </View>
            )}

            {selectedBarIndex !== null && (
              <Animated.View
                style={[
                  styles.tooltip,
                  animatedTooltipStyle,
                  {
                    backgroundColor: C.tooltipBg,
                    borderColor: C.tooltipBorder,
                  },
                ]}
              >
                <Text style={[styles.tooltipDay, { color: C.muted }]}>
                  {bars[selectedBarIndex].jour}
                </Text>
                <Text style={[styles.tooltipValue, { color: C.blueDeep }]}>
                  {bars[selectedBarIndex].value}{" "}
                  {viewMode === "quantity"
                    ? "ml"
                    : typeFilter === "tous"
                      ? "repas"
                      : typeFilter === "biberons"
                        ? bars[selectedBarIndex].value > 1 ? "biberons" : "biberon"
                        : typeFilter === "solides"
                          ? bars[selectedBarIndex].value > 1 ? "solides" : "solide"
                          : bars[selectedBarIndex].value > 1 ? "tétées" : "tétée"}
                </Text>
                {typeFilter === "tous" && viewMode === "frequency" && (
                  <Text style={[styles.tooltipDetail, { color: C.muted }]}>
                    {weeklyData[bars[selectedBarIndex].jour].seinsCount}{" "}
                    {weeklyData[bars[selectedBarIndex].jour].seinsCount > 1
                      ? "tétées"
                      : "tétée"}
                    {"\n"}
                    {weeklyData[bars[selectedBarIndex].jour].biberonsCount}{" "}
                    {weeklyData[bars[selectedBarIndex].jour].biberonsCount > 1
                      ? "biberons"
                      : "biberon"}
                    {"\n"}
                    {weeklyData[bars[selectedBarIndex].jour].solidesCount}{" "}
                    {weeklyData[bars[selectedBarIndex].jour].solidesCount > 1
                      ? "solides"
                      : "solide"}
                  </Text>
                )}
                {typeFilter === "solides" && (
                  <Text style={[styles.tooltipDetail, { color: C.muted }]}>
                    {SOLIDE_TYPES.filter((st) => weeklyData[bars[selectedBarIndex].jour].solidesByType[st] > 0)
                      .map((st) => `${weeklyData[bars[selectedBarIndex].jour].solidesByType[st]} ${SOLIDE_LABELS[st].toLowerCase()}`)
                      .join("\n")}
                  </Text>
                )}
              </Animated.View>
            )}

            <View style={styles.xAxisContainer}>
              {jours.map((jour, index) => (
                <Text
                  key={`xlabel-${index}`}
                  style={[
                    styles.xAxisText,
                    { left: bars[index].x + bars[index].width / 2 - 15, color: C.muted },
                  ]}
                >
                  {jour}
                </Text>
              ))}
            </View>
          </View>

          {typeFilter === "tous" ? (
            <View style={[styles.statsContainer, { borderTopColor: C.border }]}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: C.blueDeep }]}>
                    {totalWeekCount}
                  </Text>
                  <Text style={[styles.statLabel, { color: C.muted }]}>
                    {totalCountLabel}
                    {totalCountLabel !== "Repas" && totalWeekCount > 1
                      ? "s"
                      : ""}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <FontAwesome
                    name="person-breastfeeding"
                    size={14}
                    color={C.green}
                  />
                  <Text style={[styles.statValue, { color: C.green }]}>
                    {totalSeinsCount}
                  </Text>
                  <Text style={[styles.statLabel, { color: C.muted }]}>
                    Tétée{totalSeinsCount > 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <MaterialCommunityIcons name="baby-bottle" size={14} color={C.cyan} />
                  <Text style={[styles.statValue, { color: C.cyan }]}>
                    {totalBiberonsCount}
                  </Text>
                  <Text style={[styles.statLabel, { color: C.muted }]}>
                    Biberon{totalBiberonsCount > 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <FontAwesome name="bowl-food" size={14} color={C.orange} />
                  <Text style={[styles.statValue, { color: C.orange }]}>
                    {totalSolidesCount}
                  </Text>
                  <Text style={[styles.statLabel, { color: C.muted }]}>
                    Solide{totalSolidesCount > 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: C.blueDeep }]}>
                    {totalWeekQuantity} ml
                  </Text>
                  <Text style={[styles.statLabel, { color: C.muted }]}>
                    Total lait
                  </Text>
                </View>
              </View>
            </View>
          ) : viewMode === "quantity" ? (
            <View style={[styles.statsContainer, { borderTopColor: C.border }]}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: C.cyan }]}>
                    {totalWeekQuantity} ml
                  </Text>
                  <Text style={[styles.statLabel, { color: C.muted }]}>
                    Total semaine
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: C.cyan }]}>
                    {dailyAverageQuantity} ml
                  </Text>
                  <Text style={[styles.statLabel, { color: C.muted }]}>
                    {quantityAverageLabel}
                  </Text>
                </View>
                {maxQuantity > 0 && (
                  <View style={styles.statItem}>
                    <FontAwesome name="trophy" size={16} color={C.gold} />
                    <Text style={[styles.statValue, { color: C.gold }]}>
                      {bestQuantityDay}
                    </Text>
                    <Text style={[styles.statLabel, { color: C.muted }]}>
                      Record: {maxQuantity} ml
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={[styles.statsContainer, { borderTopColor: C.border }]}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text
                    style={[
                      styles.statValue,
                      typeFilter === "seins"
                        ? { color: C.green }
                        : typeFilter === "solides"
                          ? { color: C.orange }
                          : { color: C.cyan },
                    ]}
                  >
                    {totalWeekCount}
                  </Text>
                  <Text style={[styles.statLabel, { color: C.muted }]}>
                    {totalCountLabel}
                    {totalCountLabel !== "Repas" && totalWeekCount > 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text
                    style={[
                      styles.statValue,
                      typeFilter === "seins"
                        ? { color: C.green }
                        : typeFilter === "solides"
                          ? { color: C.orange }
                          : { color: C.cyan },
                    ]}
                  >
                    {dailyAverageCount}
                  </Text>
                  <Text style={[styles.statLabel, { color: C.muted }]}>
                    {countAverageLabel}
                  </Text>
                </View>
                {maxCount > 0 && (
                  <View style={styles.statItem}>
                    <FontAwesome name="trophy" size={16} color={C.gold} />
                    <Text style={[styles.statValue, { color: C.gold }]}>
                      {bestCountDay}
                    </Text>
                    <Text style={[styles.statLabel, { color: C.muted }]}>
                      {recordLabel}
                      {maxCount > 1 ? "s" : ""} {maxCount}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {totalWeekCount > 0 && (
            <View
              style={[
                styles.insightContainer,
                { backgroundColor: C.insightBg },
              ]}
            >
              <FontAwesome name="lightbulb" size={16} color={C.cyan} />
              <View style={styles.insightContent}>
                <Text style={[styles.insightTitle, { color: C.blueDeep }]}>
                  {typeFilter === "tous"
                    ? "Aperçu global de la semaine"
                    : typeFilter === "solides"
                      ? "Aperçu solides de la semaine"
                      : `Aperçu ${typeFilter} de la semaine`}
                </Text>
                <Text style={[styles.insightText, { color: C.insightText }]}>
                  {typeFilter === "tous"
                    ? `Cette semaine: ${totalSeinsCount} tétée${totalSeinsCount > 1 ? "s" : ""} au sein, ${totalBiberonsCount} biberon${totalBiberonsCount > 1 ? "s" : ""}${totalSolidesCount > 0 ? `, ${totalSolidesCount} solide${totalSolidesCount > 1 ? "s" : ""}` : ""} (${totalWeekQuantity} ml de lait). ${
                        (() => {
                          const max = Math.max(totalSeinsCount, totalBiberonsCount, totalSolidesCount);
                          if (max === 0) return "";
                          if (totalSeinsCount === max && totalSeinsCount > totalBiberonsCount && totalSeinsCount > totalSolidesCount)
                            return "L'allaitement domine cette semaine.";
                          if (totalBiberonsCount === max && totalBiberonsCount > totalSeinsCount && totalBiberonsCount > totalSolidesCount)
                            return "Les biberons dominent cette semaine.";
                          if (totalSolidesCount === max && totalSolidesCount > totalSeinsCount && totalSolidesCount > totalBiberonsCount)
                            return "Les solides dominent cette semaine.";
                          return "Alimentation variée cette semaine.";
                        })()
                      }`
                    : typeFilter === "seins"
                      ? `${totalSeinsCount} tétée${totalSeinsCount > 1 ? "s" : ""} cette semaine, soit ${dailyAverageCount} par jour en moyenne. ${
                          maxCount > dailyAverageCount * 1.5
                            ? `Le ${bestCountDay} a été particulièrement actif.`
                            : "Rythme régulier cette semaine."
                        }`
                      : typeFilter === "solides"
                        ? `${totalSolidesCount} repas solide${totalSolidesCount > 1 ? "s" : ""} cette semaine, soit ${dailyAverageCount} par jour en moyenne. ${
                            favoriteSolideType ? `Type favori : ${SOLIDE_LABELS[favoriteSolideType].toLowerCase()}. ` : ""
                          }${newFoodsThisWeek.length > 0 ? `${newFoodsThisWeek.length} nouvel${newFoodsThisWeek.length > 1 ? "les" : ""} introduction${newFoodsThisWeek.length > 1 ? "s" : ""} alimentaire${newFoodsThisWeek.length > 1 ? "s" : ""}. ` : ""}${
                            reactionsThisWeek > 0 ? `⚠️ ${reactionsThisWeek} réaction${reactionsThisWeek > 1 ? "s" : ""} notée${reactionsThisWeek > 1 ? "s" : ""}.` : ""
                          }`
                        : `${totalWeekQuantity} ml de lait en biberon cette semaine (${totalBiberonsCount} biberon${totalBiberonsCount > 1 ? "s au total" : ""}). Moyenne de ${dailyAverageQuantity} ml par jour.`}
                </Text>
              </View>
            </View>
          )}
          </>
          )}
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 16,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCtaText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  noDataContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  noDataText: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 6,
    borderRadius: 18,
    padding: 18,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  sectionSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  navigationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
  },
  navText: {
    fontSize: 13,
    fontWeight: "600",
  },
  todayButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  todayText: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  },
  typeFilterContainer: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    gap: 6,
  },
  typeFilterButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 3,
    zIndex: 1,
  },
  typeFilterLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  toggleContainer: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    gap: 6,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 8,
    zIndex: 1,
  },
  toggleButtonActive: {
    borderWidth: 1,
  },
  tabIndicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  legendList: {
    flexDirection: "row",
    gap: 12,
    flex: 1,
    alignItems: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  groupToggle: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  groupToggleText: {
    fontSize: 12,
    fontWeight: "600",
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  metricLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 6,
  },
  chartContainer: {
    position: "relative",
    height: CHART_HEIGHT,
    marginVertical: 4,
  },
  yAxisContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: CHART_PADDING.left,
    justifyContent: "space-between",
  },
  yAxisLabel: {
    position: "absolute",
    left: 0,
    width: CHART_PADDING.left - 10,
    alignItems: "flex-end",
  },
  yAxisText: {
    fontSize: 10,
    fontWeight: "600",
  },
  canvas: {
    width: DEFAULT_SCREEN_WIDTH,
    height: CHART_HEIGHT,
  },
  xAxisContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: CHART_PADDING.bottom,
  },
  xAxisText: {
    position: "absolute",
    fontSize: 11,
    fontWeight: "600",
    width: 30,
    textAlign: "center",
    bottom: 8,
  },
  tapHint: {
    position: "absolute",
    bottom: CHART_PADDING.bottom + 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  tapHintText: {
    fontSize: 12,
    fontWeight: "500",
  },
  tooltip: {
    position: "absolute",
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 6,
    width: 100,
    alignItems: "center",
  },
  tooltipDay: {
    fontSize: 12,
    fontWeight: "600",
  },
  tooltipValue: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  tooltipDetail: {
    fontSize: 10,
    marginTop: 2,
  },
  statsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 8,
  },
  statItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 70,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    textAlign: "center",
  },
  insightContainer: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 12,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  insightText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
