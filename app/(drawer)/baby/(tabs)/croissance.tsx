import { ThemedView } from "@/components/themed-view";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ecouterCroissancesHybrid } from "@/migration/eventsHybridService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  Canvas,
  Circle,
  LinearGradient,
  Path,
  RoundedRect,
  Shadow,
  Skia,
  Line as SkiaLine,
  vec,
} from "@shopify/react-native-skia";
import { router, useLocalSearchParams } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  FlatList,
  InteractionManager,
  Pressable,
  ScrollView,
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
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderRight } from "../../_layout";
import {
  OMS_MAX_DAY,
  OMS_PERCENTILES,
  OMSMetric,
  OMSSex,
} from "@/constants/omsPercentiles";

type CroissanceEntry = {
  id: string;
  type: "croissance";
  date: { seconds?: number } | Date;
  tailleCm?: number;
  poidsKg?: number;
  teteCm?: number;
};

type MetricKey = "poids" | "taille" | "tete";

type ChartPoint = {
  x: number;
  y: number;
  value: number;
  label: string;
  labelFull: string;
};

const CHART_HEIGHT = 210;
const CHART_PADDING = { top: 16, right: 32, bottom: 30, left: 32 };
const CHART_VISIBLE_POINTS = 5;
const CHART_AXIS_WIDTH = 40;

const TOOLTIP_H = 62; // 54 body + 8 arrow
const TOOLTIP_W = 84;

// const CHART_PADDING = {
//   top: TOOLTIP_H + 4,
//   right: TOOLTIP_W / 2 + 18,
//   bottom: 30,
//   left: TOOLTIP_W / 2 + 8,
// };

function toDate(value: any): Date {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

function createSmoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";

  const path = Skia.Path.Make();
  path.moveTo(points[0].x, points[0].y);

  if (points.length === 1) return path;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  return path;
}

function createFillPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";

  const path = Skia.Path.Make();
  const baseY = CHART_HEIGHT - CHART_PADDING.bottom;

  path.moveTo(points[0].x, baseY);
  path.lineTo(points[0].x, points[0].y);

  if (points.length > 1) {
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i + 2 < points.length ? points[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  const last = points[points.length - 1];
  path.lineTo(last.x, last.y);
  path.lineTo(last.x, baseY);
  path.close();

  return path;
}

function createBandPath(
  upper: { x: number; y: number }[],
  lower: { x: number; y: number }[],
) {
  if (upper.length === 0 || lower.length === 0) return "";
  const path = Skia.Path.Make();
  path.moveTo(upper[0].x, upper[0].y);
  for (let i = 1; i < upper.length; i += 1) {
    path.lineTo(upper[i].x, upper[i].y);
  }
  for (let i = lower.length - 1; i >= 0; i -= 1) {
    path.lineTo(lower[i].x, lower[i].y);
  }
  path.close();
  return path;
}

function parseBirthDate(value?: string | null): Date | null {
  if (!value) return null;
  const [day, month, year] = value.split("/").map((part) => Number(part));
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day);
}

function getAgeInDays(birthDate: Date, target: Date) {
  const ms = target.getTime() - birthDate.getTime();
  return Math.round(ms / 86_400_000);
}

export default function CroissanceScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { openSheet } = useSheet();
  const { openModal, returnTo } = useLocalSearchParams();
  const navigation = useNavigation();
  const headerOwnerId = useRef(
    `croissance-${Math.random().toString(36).slice(2)}`,
  );

  const [entries, setEntries] = useState<CroissanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [metric, setMetric] = useState<MetricKey>("poids");
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  );
  const selectedX = useSharedValue(0);
  const selectedY = useSharedValue(0);
  const scrollX = useSharedValue(0);
  const [chartWidth, setChartWidth] = useState(
    Dimensions.get("window").width - 80,
  );
  const chartScrollRef = useRef<ScrollView | null>(null);
  const autoScrollRef = useRef(false);

  const sheetOwnerId = "croissance";
  const returnToRef = useRef<string | null>(null);

  const refreshToday = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const palette = useMemo(
    () => ({
      surface: colorScheme === "dark" ? "#12161c" : "#ffffff",
      surfaceAlt: colorScheme === "dark" ? "#171c24" : "#f5f7f9",
      ink: colorScheme === "dark" ? "#f5f7fb" : "#1e2a36",
      muted: colorScheme === "dark" ? "#9aa5b1" : "#6a7784",
      border: colorScheme === "dark" ? "#2a3340" : "#e5ecf2",
      tint: Colors[colorScheme].tint,
      orange: "#f97316",
      orangeSoft: "#fff3e6",
      green: "#8BCF9B",
      blue: "#2f80ed",
      blueDeep: "#1b4f9c",
      blueSoft: "#e8efff",
      violet: "#7c3aed",
      violetSoft: "#f1eaff",
      amber: "#f59e0b",
      amberSoft: "#fff3cd",
    }),
    [colorScheme],
  );

  const omsPalette = useMemo(
    () => ({
      bandOuter:
        colorScheme === "dark"
          ? "rgba(255, 255, 255, 0.05)"
          : "rgba(15, 23, 42, 0.05)",
      bandInner:
        colorScheme === "dark"
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(15, 23, 42, 0.08)",
      line:
        colorScheme === "dark"
          ? "rgba(255, 255, 255, 0.24)"
          : "rgba(15, 23, 42, 0.22)",
    }),
    [colorScheme],
  );

  const metricConfig: Record<
    MetricKey,
    { label: string; color: string; soft: string; unit: string; rgb: string }
  > = {
    taille: {
      label: "Taille",
      color: palette.blue,
      soft: palette.blueSoft,
      unit: "cm",
      rgb: "37, 99, 235",
    },
    poids: {
      label: "Poids",
      color: palette.violet,
      soft: palette.violetSoft,
      unit: "kg",
      rgb: "124, 58, 237",
    },
    tete: {
      label: "Tête",
      color: palette.amber,
      soft: palette.amberSoft,
      unit: "cm",
      rgb: "245, 158, 11",
    },
  };

  const normalizeParam = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const stashReturnTo = useCallback(() => {
    const target = normalizeParam(returnTo);
    if (!target) return;
    if (
      target === "home" ||
      target === "chrono" ||
      target === "journal" ||
      target === "plus"
    ) {
      returnToRef.current = target;
      return;
    }
    returnToRef.current = null;
  }, [returnTo]);

  useEffect(() => {
    stashReturnTo();
  }, [stashReturnTo]);

  const maybeReturnTo = useCallback((targetOverride?: string | null) => {
    const target = targetOverride ?? returnToRef.current;
    returnToRef.current = null;
    if (target === "home") {
      router.replace("/baby/home");
    } else if (target === "chrono" || target === "journal") {
      router.replace("/baby/chrono");
    } else if (target === "plus") {
      router.replace("/baby/plus");
    }
  }, []);

  const openAddModal = useCallback(() => {
    openSheet({
      ownerId: sheetOwnerId,
      formType: 'croissance',
      onSuccess: refreshToday,
      onDismiss: () => {
        const returnTarget = normalizeParam(returnTo) ?? returnToRef.current;
        maybeReturnTo(returnTarget);
      },
    });
  }, [openSheet, returnTo, maybeReturnTo, refreshToday]);

  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      const task = InteractionManager.runAfterInteractions(() => {
        openAddModal();
        navigation.setParams({ openModal: undefined, returnTo: undefined });
      });
      return () => task.cancel();
    }, [navigation, openAddModal, openModal]),
  );

  const openEditModal = useCallback(
    (entry: CroissanceEntry) => {
      openSheet({
        ownerId: sheetOwnerId,
        formType: 'croissance',
        onSuccess: refreshToday,
        editData: {
          id: entry.id,
          date: toDate(entry.date),
          tailleCm: entry.tailleCm,
          poidsKg: entry.poidsKg,
          teteCm: entry.teteCm,
        },
        onDismiss: () => maybeReturnTo(returnToRef.current),
      });
    },
    [openSheet, maybeReturnTo, refreshToday],
  );

  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <View style={styles.headerActions}>
          <Pressable onPress={openAddModal} style={styles.headerButton}>
            <FontAwesome name="plus" size={20} color={colors.tint} />
          </Pressable>
        </View>
      );
      setHeaderRight(headerButtons, headerOwnerId.current);
      return () => setHeaderRight(null, headerOwnerId.current);
    }, [colors.tint, openAddModal, setHeaderRight]),
  );

  useEffect(() => {
    if (!activeChild?.id) return;
    setLoading(true);
    const unsubscribe = ecouterCroissancesHybrid(
      activeChild.id,
      (data) => {
        const normalized = data
          .map((entry) => ({
            ...entry,
            type: "croissance",
          }))
          .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
        setEntries(normalized);
        setLoading(false);
      },
      { waitForServer: true },
    );
    return () => unsubscribe();
  }, [activeChild?.id, refreshTick]);

  useEffect(() => {
    setSelectedPointIndex(null);
  }, [metric, entries]);

  const getDayLabel = useCallback((date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const eventDay = new Date(date);
    eventDay.setHours(0, 0, 0, 0);

    if (eventDay.getTime() === today.getTime()) {
      return "Aujourd'hui";
    }
    if (eventDay.getTime() === yesterday.getTime()) {
      return "Hier";
    }
    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, []);

  const renderItem = ({
    item,
    index,
  }: {
    item: CroissanceEntry;
    index: number;
  }) => {
    const date = toDate(item.date);
    const currentDayLabel = getDayLabel(date);
    const prevEntry = index > 0 ? entries[index - 1] : null;
    const prevDate = prevEntry ? toDate(prevEntry.date) : null;
    const prevDayLabel = prevDate ? getDayLabel(prevDate) : null;
    const showDaySeparator = index === 0 || currentDayLabel !== prevDayLabel;

    return (
      <React.Fragment>
        {showDaySeparator && (
          <View style={styles.daySeparator}>
            <View
              style={[
                styles.daySeparatorLine,
                { backgroundColor: palette.border },
              ]}
            />
            <Text style={[styles.daySeparatorText, { color: palette.muted }]}>
              {currentDayLabel}
            </Text>
            <View
              style={[
                styles.daySeparatorLine,
                { backgroundColor: palette.border },
              ]}
            />
          </View>
        )}
        <View style={styles.itemRow}>
          <View style={styles.timelineColumn}>
            <View style={[styles.dot, { backgroundColor: palette.green }]} />
            <View style={[styles.line, { backgroundColor: palette.border }]} />
          </View>
          <Text style={[styles.timeText, { color: palette.muted }]}>
            {date.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <Pressable
            onLongPress={() => openEditModal(item)}
            delayLongPress={250}
            style={({ pressed }) => [
              styles.card,
              {
                borderColor: palette.border,
                backgroundColor: palette.surface,
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <FontAwesome name="seedling" size={14} color={palette.green} />
                <Text style={[styles.cardTitle, { color: palette.ink }]}>
                  Croissance
                </Text>
              </View>
              <FontAwesome
                name="pen-to-square"
                size={12}
                color={palette.muted}
              />
            </View>
            <View style={styles.metricPillRow}>
              {item.tailleCm ? (
                <View
                  style={[
                    styles.metricPill,
                    { backgroundColor: palette.blueSoft },
                  ]}
                >
                  <View style={styles.metricHeader}>
                    <FontAwesome
                      name="ruler-vertical"
                      size={12}
                      color={palette.blue}
                    />
                    <Text style={[styles.metricLabel, { color: palette.ink }]}>
                      Taille
                    </Text>
                  </View>
                  <Text style={[styles.metricValue, { color: palette.ink }]}>
                    {item.tailleCm} cm
                  </Text>
                </View>
              ) : null}
              {item.poidsKg ? (
                <View
                  style={[
                    styles.metricPill,
                    { backgroundColor: palette.violetSoft },
                  ]}
                >
                  <View style={styles.metricHeader}>
                    <FontAwesome
                      name="weight-scale"
                      size={12}
                      color={palette.violet}
                    />
                    <Text style={[styles.metricLabel, { color: palette.ink }]}>
                      Poids
                    </Text>
                  </View>
                  <Text style={[styles.metricValue, { color: palette.ink }]}>
                    {item.poidsKg} kg
                  </Text>
                </View>
              ) : null}
              {item.teteCm ? (
                <View
                  style={[
                    styles.metricPill,
                    { backgroundColor: palette.amberSoft },
                  ]}
                >
                  <View style={styles.metricHeader}>
                    <MaterialCommunityIcons
                      name="baby-face-outline"
                      size={12}
                      color={palette.amber}
                    />
                    <Text style={[styles.metricLabel, { color: palette.ink }]}>
                      Tête
                    </Text>
                  </View>
                  <Text style={[styles.metricValue, { color: palette.ink }]}>
                    {item.teteCm} cm
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </View>
      </React.Fragment>
    );
  };

  const metricEntries = useMemo(() => {
    return entries
      .map((entry) => ({
        date: toDate(entry.date),
        value:
          metric === "poids"
            ? entry.poidsKg
            : metric === "taille"
              ? entry.tailleCm
              : entry.teteCm,
      }))
      .filter((entry) => typeof entry.value === "number")
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [entries, metric]);

  const birthDate = useMemo(
    () => parseBirthDate(activeChild?.birthDate),
    [activeChild?.birthDate],
  );
  const omsSex = activeChild?.gender ?? null;

  const labels = metricEntries.map((entry) =>
    entry.date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    }),
  );
  const labelsFull = metricEntries.map((entry) =>
    entry.date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  );
  const values = metricEntries.map((entry) => entry.value as number);
  const hasData = values.length > 0;
  const metricStyle = metricConfig[metric];

  const plotWidth = useMemo(() => {
    const pointCount = labels.length;
    if (chartWidth <= 0) return chartWidth;
    if (pointCount <= CHART_VISIBLE_POINTS) return chartWidth;
    const spacing =
      CHART_VISIBLE_POINTS > 1
        ? (chartWidth - CHART_PADDING.left - CHART_PADDING.right) /
          (CHART_VISIBLE_POINTS - 1)
        : 0;
    return (
      CHART_PADDING.left + CHART_PADDING.right + spacing * (pointCount - 1)
    );
  }, [chartWidth, labels.length]);

  const { chartPoints, yAxisLabels, maxValue, oms } = useMemo(() => {
    if (!hasData || plotWidth <= 0) {
      return {
        chartPoints: [] as ChartPoint[],
        yAxisLabels: [] as { value: number; y: number }[],
        maxValue: 0,
        oms: null as null | {
          lines: Record<
            "p3" | "p15" | "p50" | "p85" | "p97",
            { x: number; y: number }[]
          >;
          bands: { upper: { x: number; y: number }[]; lower: { x: number; y: number }[] }[];
        },
      };
    }
    const ageDays =
      birthDate && omsSex
        ? metricEntries.map((entry) => getAgeInDays(birthDate, entry.date))
        : null;
    const omsAvailable =
      ageDays &&
      ageDays.length === values.length &&
      ageDays.every((day) => day >= 0 && day <= OMS_MAX_DAY);
    const omsSource =
      omsAvailable && omsSex
        ? OMS_PERCENTILES[omsSex as OMSSex][metric as OMSMetric]
        : null;
    const omsValues = omsSource
      ? {
          p3: ageDays!.map((day) => omsSource.p3[day]),
          p15: ageDays!.map((day) => omsSource.p15[day]),
          p50: ageDays!.map((day) => omsSource.p50[day]),
          p85: ageDays!.map((day) => omsSource.p85[day]),
          p97: ageDays!.map((day) => omsSource.p97[day]),
        }
      : null;

    const rangeValues = [
      ...values,
      ...(omsValues
        ? [
            ...omsValues.p3,
            ...omsValues.p15,
            ...omsValues.p50,
            ...omsValues.p85,
            ...omsValues.p97,
          ]
        : []),
    ];

    const rangeMax = Math.max(...rangeValues);
    const rangeMin = Math.min(...rangeValues);
    const babyMax = Math.max(...values);
    const range = Math.max(rangeMax - rangeMin, 1);
    const paddedMin = Math.max(0, rangeMin - range * 0.15);
    const paddedMax = rangeMax + range * 0.15;
    const chartAreaHeight =
      CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const spacing =
      values.length > 1
        ? (plotWidth - CHART_PADDING.left - CHART_PADDING.right) /
          (values.length - 1)
        : 0;

    const toY = (value: number) =>
      CHART_PADDING.top +
      chartAreaHeight * (1 - (value - paddedMin) / (paddedMax - paddedMin));

    const points = values.map((value, index) => ({
      x: CHART_PADDING.left + spacing * index,
      y: toY(value),
      value,
      label: labels[index] ?? "",
      labelFull: labelsFull[index] ?? "",
    }));

    const omsLines = omsValues
      ? {
          p3: omsValues.p3.map((value, index) => ({
            x: CHART_PADDING.left + spacing * index,
            y: toY(value),
          })),
          p15: omsValues.p15.map((value, index) => ({
            x: CHART_PADDING.left + spacing * index,
            y: toY(value),
          })),
          p50: omsValues.p50.map((value, index) => ({
            x: CHART_PADDING.left + spacing * index,
            y: toY(value),
          })),
          p85: omsValues.p85.map((value, index) => ({
            x: CHART_PADDING.left + spacing * index,
            y: toY(value),
          })),
          p97: omsValues.p97.map((value, index) => ({
            x: CHART_PADDING.left + spacing * index,
            y: toY(value),
          })),
        }
      : null;

    const omsBands = omsLines
      ? [
          { upper: omsLines.p15, lower: omsLines.p3 },
          { upper: omsLines.p50, lower: omsLines.p15 },
          { upper: omsLines.p85, lower: omsLines.p50 },
          { upper: omsLines.p97, lower: omsLines.p85 },
        ]
      : [];

    const yLabels = Array.from({ length: 4 }, (_, i) => {
      const val = paddedMin + ((paddedMax - paddedMin) / 3) * i;
      return { value: Number.parseFloat(val.toFixed(1)), y: toY(val) };
    }).reverse();

    return {
      chartPoints: points,
      yAxisLabels: yLabels,
      maxValue: babyMax,
      oms: omsLines ? { lines: omsLines, bands: omsBands } : null,
    };
  }, [
    birthDate,
    hasData,
    labels,
    labelsFull,
    metric,
    metricEntries,
    omsSex,
    plotWidth,
    values,
  ]);

  const linePath = useMemo(() => createSmoothPath(chartPoints), [chartPoints]);
  const fillPath = useMemo(() => createFillPath(chartPoints), [chartPoints]);

  useEffect(() => {
    if (!hasData || chartWidth <= 0) return;
    if (plotWidth <= chartWidth) return;
    chartScrollRef.current?.scrollTo({
      x: Math.max(plotWidth - chartWidth, 0),
      animated: false,
    });
  }, [chartWidth, hasData, metric, plotWidth]);

  const findNearestPoint = useCallback(
    (tapX: number) => {
      let nearest = 0;
      let minDistance = Infinity;
      chartPoints.forEach((point, index) => {
        const distance = Math.abs(point.x - tapX);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = index;
        }
      });
      return minDistance < 40 ? nearest : null;
    },
    [chartPoints],
  );

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => {
      if (!hasData || chartPoints.length === 0) return;
      const pointIndex = findNearestPoint(event.x);
      if (pointIndex !== null) {
        setSelectedPointIndex((prev) => {
          if (prev === pointIndex) {
            return null;
          }
          selectedX.value = withSpring(chartPoints[pointIndex].x);
          selectedY.value = withSpring(chartPoints[pointIndex].y);
          return pointIndex;
        });
        if (plotWidth > chartWidth) {
          const target = Math.min(
            Math.max(chartPoints[pointIndex].x - chartWidth / 2, 0),
            plotWidth - chartWidth,
          );
          autoScrollRef.current = true;
          chartScrollRef.current?.scrollTo({ x: target, animated: true });
        }
      } else {
        setSelectedPointIndex(null);
      }
    });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const animatedTooltipStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: CHART_AXIS_WIDTH + selectedX.value - scrollX.value - 40 },
      { translateY: selectedY.value - 74 },
    ],
  }));

  const latestValue = useMemo(() => {
    const entry = [...metricEntries]
      .reverse()
      .find((e) => typeof e.value === "number");
    return entry?.value;
  }, [metricEntries]);

  const deltaValue = useMemo(() => {
    if (metricEntries.length < 2) return null;
    const last = metricEntries[metricEntries.length - 1].value as number;
    const prev = metricEntries[metricEntries.length - 2].value as number;
    return last - prev;
  }, [metricEntries]);

  return (
    <ThemedView style={[styles.screen, { backgroundColor: "#f8f9fa" }]}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <GestureHandlerRootView style={styles.container}>
          <View style={styles.headerBlock}>
            <Text style={[styles.title, { color: palette.ink }]}>
              Croissance
            </Text>
            <Text style={[styles.subtitle, { color: palette.muted }]}>
              Taille, poids et tour de tête
            </Text>
          </View>

          {loading ? (
            <View style={styles.fullScreenLoading}>
              <IconPulseDots color={colors.tint} />
            </View>
          ) : (
            <View style={styles.body}>
              <View
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
                onLayout={(event) => {
                  const width =
                    event.nativeEvent.layout.width - CHART_AXIS_WIDTH - 12;
                  if (width > 0 && Math.abs(width - chartWidth) > 1) {
                    setChartWidth(width);
                  }
                }}
              >
                <View style={styles.metricTabs}>
                  {(["taille", "poids", "tete"] as MetricKey[]).map((key) => (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.metricTab,
                        metric === key && {
                          backgroundColor: palette.surface,
                          // borderColor: metricConfig[key].color,
                        },
                      ]}
                      onPress={() => setMetric(key)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.metricTabText,
                          metric === key && { color: palette.ink },
                        ]}
                      >
                        {metricConfig[key].label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.metricsRow}>
                  <View
                    style={[
                      styles.summaryCard,
                      { borderColor: palette.border },
                    ]}
                  >
                    <Text style={styles.summaryLabel}>Dernière mesure</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        { color: metricStyle.color },
                      ]}
                    >
                      {latestValue ? `${latestValue} ${metricStyle.unit}` : "-"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.summaryCard,
                      { borderColor: palette.border },
                    ]}
                  >
                    <Text style={styles.summaryLabel}>Variation</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        { color: metricStyle.color },
                      ]}
                    >
                      {deltaValue === null
                        ? "-"
                        : `${deltaValue > 0 ? "+" : ""}${deltaValue.toFixed(1)} ${
                            metricStyle.unit
                          }`}
                    </Text>
                  </View>
                </View>

                {!hasData ? (
                  <View style={styles.chartEmpty}>
                    <Text style={[styles.emptyText, { color: palette.muted }]}>
                      Ajoute une mesure pour voir la courbe.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.chartRow}>
                    <View style={styles.yAxisColumn}>
                      {yAxisLabels.map((label, index) => (
                        <Text
                          key={`${label.value}-${index}`}
                          style={[styles.yAxisLabel, { color: palette.muted }]}
                        >
                          {label.value}
                        </Text>
                      ))}
                    </View>
                    <Animated.ScrollView
                      ref={chartScrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      onScrollBeginDrag={() => setSelectedPointIndex(null)}
                      onScroll={scrollHandler}
                      onMomentumScrollEnd={() => {
                        autoScrollRef.current = false;
                      }}
                      scrollEventThrottle={16}
                      style={styles.chartScroll}
                    >
                      <View style={styles.chartWrapper}>
                        <GestureDetector gesture={tapGesture}>
                          <Canvas
                            style={{ width: plotWidth, height: CHART_HEIGHT }}
                          >
                            <RoundedRect
                              x={CHART_PADDING.left}
                              y={CHART_PADDING.top}
                              width={
                                plotWidth -
                                CHART_PADDING.left -
                                CHART_PADDING.right
                              }
                              height={
                                CHART_HEIGHT -
                                CHART_PADDING.top -
                                CHART_PADDING.bottom
                              }
                              r={14}
                              color={palette.surface}
                            >
                              <LinearGradient
                                start={vec(
                                  CHART_PADDING.left,
                                  CHART_PADDING.top,
                                )}
                                end={vec(
                                  CHART_PADDING.left,
                                  CHART_HEIGHT - CHART_PADDING.bottom,
                                )}
                                colors={["#ffffff", "#ffffff"]}
                              />
                            </RoundedRect>

                            {oms?.bands.map((band, index) => (
                              <Path
                                key={`oms-band-${index}`}
                                path={createBandPath(band.upper, band.lower)}
                                color={
                                  index === 0 || index === 3
                                    ? omsPalette.bandOuter
                                    : omsPalette.bandInner
                                }
                              />
                            ))}

                            {yAxisLabels.map((label, index) => (
                              <SkiaLine
                                key={`grid-${index}`}
                                p1={vec(CHART_PADDING.left, label.y)}
                                p2={vec(
                                  plotWidth - CHART_PADDING.right,
                                  label.y,
                                )}
                                color="rgba(15, 23, 42, 0.08)"
                                strokeWidth={1}
                              />
                            ))}

                            {oms ? (
                              <>
                                {(["p3", "p15", "p50", "p85", "p97"] as const).map(
                                  (key) => (
                                    <Path
                                      key={`oms-line-${key}`}
                                      path={createSmoothPath(oms.lines[key])}
                                      style="stroke"
                                      strokeWidth={1.5}
                                      color={omsPalette.line}
                                    />
                                  ),
                                )}
                              </>
                            ) : null}

                            <Path path={fillPath}>
                              <LinearGradient
                                start={vec(0, CHART_PADDING.top)}
                                end={vec(
                                  0,
                                  CHART_HEIGHT - CHART_PADDING.bottom,
                                )}
                                colors={[
                                  `rgba(${metricStyle.rgb}, 0.22)`,
                                  `rgba(${metricStyle.rgb}, 0.02)`,
                                ]}
                              />
                            </Path>

                            <Path
                              path={linePath}
                              style="stroke"
                              strokeWidth={3}
                              color={metricStyle.color}
                            >
                              <Shadow
                                dx={0}
                                dy={2}
                                blur={4}
                                color={`rgba(${metricStyle.rgb}, 0.35)`}
                              />
                            </Path>

                            {chartPoints.map((point, index) => {
                              const isSelected = selectedPointIndex === index;
                              const isMax =
                                point.value === maxValue && point.value > 0;
                              return (
                                <React.Fragment key={`pt-${index}`}>
                                  {isSelected && (
                                    <Circle
                                      cx={point.x}
                                      cy={point.y}
                                      r={10}
                                      color="rgba(249, 115, 22, 0.18)"
                                    />
                                  )}
                                  <Circle
                                    cx={point.x}
                                    cy={point.y}
                                    r={isSelected || isMax ? 6 : 4.5}
                                    color={
                                      isSelected
                                        ? palette.orange
                                        : metricStyle.color
                                    }
                                  >
                                    <Shadow
                                      dx={0}
                                      dy={2}
                                      blur={4}
                                      color={`rgba(${metricStyle.rgb}, 0.3)`}
                                    />
                                  </Circle>
                                </React.Fragment>
                              );
                            })}
                          </Canvas>
                        </GestureDetector>
                      </View>
                    </Animated.ScrollView>

                    {selectedPointIndex !== null &&
                    chartPoints[selectedPointIndex] ? (
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.tooltip,
                          { borderColor: metricStyle.color },
                          animatedTooltipStyle,
                        ]}
                      >
                        <View style={styles.tooltipContent}>
                          <Text style={styles.tooltipTime}>
                            {chartPoints[selectedPointIndex].labelFull}
                          </Text>
                          <Text
                            style={[
                              styles.tooltipValue,
                              { color: metricStyle.color },
                            ]}
                          >
                            {chartPoints[selectedPointIndex].value}{" "}
                            {metricStyle.unit}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.tooltipArrow,
                            { borderTopColor: metricStyle.color },
                          ]}
                        />
                      </Animated.View>
                    ) : null}
                  </View>
                )}
              </View>

              <FlatList
                data={entries}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                style={styles.listWindow}
                initialNumToRender={2}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: palette.muted }]}>
                      Aucune mesure pour le moment.
                    </Text>
                  </View>
                }
              />
            </View>
          )}
        </GestureHandlerRootView>
      </SafeAreaView>
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
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  headerBlock: {
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 40,
    gap: 12,
  },
  listWindow: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  chartCard: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  metricTabs: {
    flexDirection: "row",
    backgroundColor: "#f5f6f8",
    borderRadius: 12,
    padding: 4,
    gap: 6,
    marginBottom: 12,
  },
  metricTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    // borderWidth: 1,
    // borderColor: "transparent",
  },
  metricTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6c757d",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#eef1f5",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    color: "#9aa0a6",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    backgroundColor: "#ffffff",
  },
  summaryLabel: {
    fontSize: 11,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 6,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "stretch",
    position: "relative",
  },
  yAxisColumn: {
    width: CHART_AXIS_WIDTH,
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  yAxisLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  chartWrapper: {
    position: "relative",
  },
  chartScroll: {
    flex: 1,
  },
  chartEmpty: {
    alignItems: "center",
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 13,
  },
  tooltip: {
    position: "absolute",
    backgroundColor: "white",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6e8da",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 1000,
    width: 84,
    height: 54,
  },
  tooltipContent: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipTime: {
    fontSize: 10,
    color: "#6c757d",
    fontWeight: "500",
  },
  tooltipValue: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  tooltipArrow: {
    position: "absolute",
    bottom: -8,
    left: "50%",
    marginLeft: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginVertical: 7,
  },
  timelineColumn: {
    width: 20,
    alignItems: "center",
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
    width: 42,
    marginTop: 6,
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
  daySeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 12,
  },
  daySeparatorLine: {
    flex: 1,
    height: 1,
  },
  daySeparatorText: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  fullScreenLoading: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingVertical: 32,
  },
  card: {
    flex: 1,
    borderRadius: 16,
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
    marginBottom: 8,
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
  metricPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricPill: {
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
  },
  headerButton: {
    padding: 6,
  },
});
