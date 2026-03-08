import { ThemedView } from "@/components/themed-view";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { getNeutralColors } from "@/constants/dashboardColors";
import {
  OMS_MAX_DAY,
  OMS_PERCENTILES,
  OMSMetric,
  OMSSex,
} from "@/constants/omsPercentiles";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { ecouterCroissancesHybrid } from "@/migration/eventsHybridService";
import { supprimerEvenement } from "@/services/eventsService";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  Canvas,
  Circle,
  LinearGradient,
  matchFont,
  Path,
  RoundedRect,
  Shadow,
  Skia,
  Line as SkiaLine,
  Text as SkiaText,
  vec,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
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
  RefreshControl,
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
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderRight } from "../../_layout";

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
const CHART_PADDING = { top: 16, right: 55, bottom: 30, left: 32 };
const CHART_VISIBLE_POINTS = 5;
const CHART_AXIS_WIDTH = 40;

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

const DeleteAction = React.memo(function DeleteAction({
  onPress,
}: {
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.deleteAction}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Supprimer cet événement"
    >
      <Ionicons name="trash-outline" size={20} color="#fff" />
      <Text style={styles.deleteActionText}>Supprimer</Text>
    </Pressable>
  );
});

export default function CroissanceScreen() {
  const { activeChild } = useBaby();
  const { firebaseUser } = useAuth();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
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
  const { openSheet } = useSheet();
  const { showToast } = useToast();
  const { openModal, returnTo } = useLocalSearchParams();
  const navigation = useNavigation();
  const headerOwnerId = useRef(
    `croissance-${Math.random().toString(36).slice(2)}`,
  );
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canManageContent =
    permissions.role === "owner" || permissions.role === "admin";

  const PAGE_SIZE = 3;
  const [entries, setEntries] = useState<CroissanceEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    event: CroissanceEntry | null;
  }>({ visible: false, event: null });
  const [metric, setMetric] = useState<MetricKey>("poids");
  const metricKeys: MetricKey[] = ["taille", "poids", "tete"];
  const [tabsWidth, setTabsWidth] = useState(0);
  const tabIndicatorX = useSharedValue(1); // index initial = poids (1)

  const tabWidth = tabsWidth > 0 ? (tabsWidth - 8 - 12) / 3 : 0; // 8 = padding*2, 12 = gap*2
  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(4 + tabIndicatorX.value * (tabWidth + 6), { duration: 250 }) }],
    width: tabWidth,
  }));

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

  const triggerRefresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const handlePullToRefresh = useCallback(() => {
    setIsRefreshing(true);
    triggerRefresh();
  }, [triggerRefresh]);

  const palette = useMemo(
    () => ({
      surface: colorScheme === "dark" ? "#12161c" : "#ffffff",
      surfaceAlt: colorScheme === "dark" ? "#171c24" : "#f5f7f9",
      ink: colorScheme === "dark" ? "#f5f7fb" : "#1e2a36",
      muted: colorScheme === "dark" ? "#9aa5b1" : "#6a7784",
      border: colorScheme === "dark" ? "#2a3340" : "#e5ecf2",
      tint: Colors[colorScheme].tint,
      orange: "#f97316",
      green: "#8BCF9B",
      blue: "#2f80ed",
      blueSoft: colorScheme === "dark" ? "rgba(47, 128, 237, 0.15)" : "#e8efff",
      violet: "#7c3aed",
      violetSoft:
        colorScheme === "dark" ? "rgba(124, 58, 237, 0.15)" : "#f1eaff",
      amber: "#f59e0b",
      amberSoft:
        colorScheme === "dark" ? "rgba(245, 158, 11, 0.15)" : "#fff3cd",
    }),
    [colorScheme],
  );

  const omsPalette = useMemo(
    () => ({
      // Bandes colorées pour les zones de percentiles
      bandExtreme:
        colorScheme === "dark"
          ? "rgba(251, 146, 60, 0.12)" // orange très pâle
          : "rgba(251, 146, 60, 0.08)",
      bandLimit:
        colorScheme === "dark"
          ? "rgba(252, 211, 77, 0.15)" // jaune pâle
          : "rgba(252, 211, 77, 0.10)",
      bandNormal:
        colorScheme === "dark"
          ? "rgba(134, 239, 172, 0.18)" // vert pâle
          : "rgba(134, 239, 172, 0.12)",
      // Lignes des percentiles
      lineP50:
        colorScheme === "dark"
          ? "rgba(34, 197, 94, 0.6)" // vert médian bien visible
          : "rgba(34, 197, 94, 0.5)",
      lineOther:
        colorScheme === "dark"
          ? "rgba(148, 163, 184, 0.35)" // gris pour autres percentiles
          : "rgba(148, 163, 184, 0.30)",
    }),
    [colorScheme],
  );

  const metricConfig = useMemo<
    Record<
      MetricKey,
      { label: string; color: string; soft: string; unit: string; rgb: string }
    >
  >(
    () => ({
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
    }),
    [
      palette.blue,
      palette.blueSoft,
      palette.violet,
      palette.violetSoft,
      palette.amber,
      palette.amberSoft,
    ],
  );

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
      formType: "croissance",
      onSuccess: triggerRefresh,
      onDismiss: () => {
        const returnTarget = normalizeParam(returnTo) ?? returnToRef.current;
        maybeReturnTo(returnTarget);
      },
    });
  }, [openSheet, returnTo, maybeReturnTo, triggerRefresh]);

  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      const task = InteractionManager.runAfterInteractions(() => {
        openAddModal();
        navigation.setParams({
          openModal: undefined,
          returnTo: undefined,
        } as any);
      });
      return () => task.cancel();
    }, [navigation, openAddModal, openModal]),
  );

  const openEditModal = useCallback(
    (entry: CroissanceEntry) => {
      openSheet({
        ownerId: sheetOwnerId,
        formType: "croissance",
        onSuccess: triggerRefresh,
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
    [openSheet, maybeReturnTo, triggerRefresh],
  );

  const handleEventDelete = useCallback((event: CroissanceEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, event });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.event?.id) return;
    const eventId = deleteConfirm.event.id;
    setDeleteConfirm({ visible: false, event: null });
    try {
      await supprimerEvenement(activeChild.id, eventId);
      showToast("Événement supprimé");
      triggerRefresh();
    } catch {
      showToast("Impossible de supprimer cet événement");
    }
  }, [activeChild?.id, deleteConfirm.event, showToast, triggerRefresh]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, event: null });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!canManageContent) {
        setHeaderRight(null, headerOwnerId.current);
        return () => setHeaderRight(null, headerOwnerId.current);
      }
      const headerButtons = (
        <View style={styles.headerActions}>
          <Pressable
            onPress={openAddModal}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Ajouter une mesure"
          >
            <Ionicons name="add" size={24} color={palette.tint} />
          </Pressable>
        </View>
      );
      setHeaderRight(headerButtons, headerOwnerId.current);
      return () => setHeaderRight(null, headerOwnerId.current);
    }, [canManageContent, palette.tint, openAddModal, setHeaderRight]),
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
        setIsRefreshing(false);
      },
      { waitForServer: true },
    );
    return () => unsubscribe();
  }, [activeChild?.id, refreshTick]);

  useEffect(() => {
    setSelectedPointIndex(null);
    setVisibleCount(PAGE_SIZE);
  }, [metric, entries]);

  const visibleEntries = useMemo(
    () => entries.slice(0, visibleCount),
    [entries, visibleCount],
  );
  const hasMore = visibleCount < entries.length;

  const handleShowMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

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

  const renderItem = useCallback(
    ({ item, index }: { item: CroissanceEntry; index: number }) => {
      const date = toDate(item.date);
      const currentDayLabel = getDayLabel(date);
      const prevEntry = index > 0 ? visibleEntries[index - 1] : null;
      const prevDate = prevEntry ? toDate(prevEntry.date) : null;
      const prevDayLabel = prevDate ? getDayLabel(prevDate) : null;
      const showDaySeparator = index === 0 || currentDayLabel !== prevDayLabel;
      const nextEntry = index < visibleEntries.length - 1 ? visibleEntries[index + 1] : null;
      const nextDayLabel = nextEntry ? getDayLabel(toDate(nextEntry.date)) : null;
      const isLastInSection = !nextEntry || currentDayLabel !== nextDayLabel;

      const cardContent = (
        <TouchableOpacity
          onPress={
            canManageContent
              ? () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  openEditModal(item);
                }
              : undefined
          }
          disabled={!canManageContent}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Mesure du ${currentDayLabel}${item.poidsKg ? `, poids ${item.poidsKg} kg` : ""}${item.tailleCm ? `, taille ${item.tailleCm} cm` : ""}${item.teteCm ? `, tour de tête ${item.teteCm} cm` : ""}`}
          accessibilityHint={
            canManageContent ? "Appuyer pour modifier" : undefined
          }
          style={[
            styles.card,
            {
              borderColor: palette.border,
              backgroundColor: palette.surface,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <FontAwesome name="seedling" size={14} color={palette.green} />
              <Text style={[styles.cardTitle, { color: palette.ink }]}>
                Croissance
              </Text>
            </View>
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
        </TouchableOpacity>
      );

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
          <ReanimatedSwipeable
            renderRightActions={
              canManageContent && item.id
                ? () => (
                    <DeleteAction onPress={() => handleEventDelete(item)} />
                  )
                : undefined
            }
            friction={2}
            rightThreshold={40}
            overshootRight={false}
            enabled={canManageContent && !!item.id}
          >
            <View style={styles.itemRow}>
              <View style={styles.timelineColumn}>
                <View style={[styles.dot, { backgroundColor: palette.green }]} />
                <View
                  style={[
                    styles.line,
                    { backgroundColor: `${Colors[colorScheme].tabIconDefault}30` },
                    isLastInSection && styles.lineLast,
                  ]}
                />
              </View>
              <Text style={[styles.timeText, { color: palette.muted }]}>
                {date.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              <View style={styles.cardSwipeWrapper}>
                {cardContent}
              </View>
            </View>
          </ReanimatedSwipeable>
        </React.Fragment>
      );
    },
    [
      visibleEntries,
      canManageContent,
      colorScheme,
      getDayLabel,
      handleEventDelete,
      openEditModal,
      palette,
    ],
  );

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

  const labels = useMemo(() => metricEntries.map((entry) =>
    entry.date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    }),
  ), [metricEntries]);
  const labelsFull = useMemo(() => metricEntries.map((entry) =>
    entry.date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  ), [metricEntries]);
  const values = useMemo(() => metricEntries.map((entry) => entry.value as number), [metricEntries]);
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
          bands: {
            upper: { x: number; y: number }[];
            lower: { x: number; y: number }[];
          }[];
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
      { translateX: CHART_AXIS_WIDTH + selectedX.value - scrollX.value - 45 },
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
    <ThemedView
      style={[styles.screen, { backgroundColor: palette.surfaceAlt }]}
    >
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
              <IconPulseDots color={palette.tint} />
            </View>
          ) : (
            <View style={styles.body}>
              <FlatList
                data={visibleEntries}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                style={styles.listWindow}
                initialNumToRender={PAGE_SIZE}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handlePullToRefresh}
                    tintColor={palette.tint}
                  />
                }
                ListHeaderComponent={
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
                    <View
                      style={[styles.metricTabs, { backgroundColor: palette.surfaceAlt }]}
                      accessibilityRole="tablist"
                      onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width)}
                    >
                      {tabWidth > 0 && (
                        <Animated.View
                          style={[
                            styles.metricTabIndicator,
                            { backgroundColor: palette.surface },
                            animatedIndicatorStyle,
                          ]}
                        />
                      )}
                      {metricKeys.map((key, index) => (
                        <TouchableOpacity
                          key={key}
                          style={styles.metricTab}
                          onPress={() => {
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light,
                            );
                            tabIndicatorX.value = index;
                            setMetric(key);
                          }}
                          activeOpacity={0.7}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: metric === key }}
                          accessibilityLabel={`Courbe ${metricConfig[key].label}`}
                        >
                          <Text
                            style={[
                              styles.metricTabText,
                              { color: palette.muted },
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
                          {
                            borderColor: palette.border,
                            backgroundColor: palette.surface,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.summaryLabel,
                            { color: palette.muted },
                          ]}
                        >
                          Dernière mesure
                        </Text>
                        <Text
                          style={[
                            styles.summaryValue,
                            { color: metricStyle.color },
                          ]}
                        >
                          {latestValue
                            ? `${latestValue} ${metricStyle.unit}`
                            : "-"}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.summaryCard,
                          {
                            borderColor: palette.border,
                            backgroundColor: palette.surface,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.summaryLabel,
                            { color: palette.muted },
                          ]}
                        >
                          Variation
                        </Text>
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
                        <Text
                          style={[styles.emptyText, { color: palette.muted }]}
                        >
                          Ajoute une mesure pour voir la courbe.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.chartRow}>
                        <View style={styles.yAxisColumn}>
                          {yAxisLabels.map((label, index) => (
                            <View
                              key={`${label.value}-${index}`}
                              style={[
                                styles.yAxisLabelWrap,
                                { top: label.y - 7 },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.yAxisLabel,
                                  { color: palette.muted },
                                ]}
                              >
                                {label.value}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <Animated.ScrollView
                          ref={chartScrollRef as any}
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
                                style={{
                                  width: plotWidth,
                                  height: CHART_HEIGHT,
                                }}
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
                                    colors={[palette.surface, palette.surface]}
                                  />
                                </RoundedRect>

                                {oms?.bands.map((band, index) => {
                                  const bandColor =
                                    index === 0 || index === 3
                                      ? omsPalette.bandExtreme
                                      : index === 1 || index === 2
                                        ? omsPalette.bandLimit
                                        : omsPalette.bandNormal;
                                  return (
                                    <Path
                                      key={`oms-band-${index}`}
                                      path={createBandPath(
                                        band.upper,
                                        band.lower,
                                      )}
                                      color={bandColor}
                                    />
                                  );
                                })}

                                {yAxisLabels.map((label, index) => (
                                  <SkiaLine
                                    key={`grid-${index}`}
                                    p1={vec(CHART_PADDING.left, label.y)}
                                    p2={vec(
                                      plotWidth - CHART_PADDING.right,
                                      label.y,
                                    )}
                                    color={
                                      colorScheme === "dark"
                                        ? "rgba(255, 255, 255, 0.08)"
                                        : "rgba(15, 23, 42, 0.08)"
                                    }
                                    strokeWidth={1}
                                  />
                                ))}

                                {oms ? (
                                  <>
                                    {(
                                      [
                                        "p3",
                                        "p15",
                                        "p50",
                                        "p85",
                                        "p97",
                                      ] as const
                                    ).map((key) => {
                                      const line = oms.lines[key];
                                      const lastPoint = line[line.length - 1];
                                      const fontFamily = "System";
                                      const fontSize = 9;
                                      const font = matchFont({
                                        fontFamily,
                                        fontSize,
                                        fontWeight: "600",
                                      });

                                      return (
                                        <React.Fragment key={`oms-${key}`}>
                                          <Path
                                            path={createSmoothPath(line)}
                                            style="stroke"
                                            strokeWidth={
                                              key === "p50" ? 2 : 1.2
                                            }
                                            color={
                                              key === "p50"
                                                ? omsPalette.lineP50
                                                : omsPalette.lineOther
                                            }
                                          />
                                          {lastPoint && (
                                            <SkiaText
                                              x={lastPoint.x + 8}
                                              y={lastPoint.y + 3}
                                              text={key.toUpperCase()}
                                              font={font}
                                              color={
                                                key === "p50"
                                                  ? omsPalette.lineP50
                                                  : omsPalette.lineOther
                                              }
                                            />
                                          )}
                                        </React.Fragment>
                                      );
                                    })}
                                  </>
                                ) : null}

                                <Path
                                  path={linePath}
                                  style="stroke"
                                  strokeWidth={3.5}
                                  color={metricStyle.color}
                                >
                                  <Shadow
                                    dx={0}
                                    dy={3}
                                    blur={6}
                                    color={`rgba(${metricStyle.rgb}, 0.45)`}
                                  />
                                </Path>

                                {chartPoints.map((point, index) => {
                                  const isSelected =
                                    selectedPointIndex === index;
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
                              {
                                borderColor: metricStyle.color,
                                backgroundColor: palette.surface,
                              },
                              animatedTooltipStyle,
                            ]}
                          >
                            <View style={styles.tooltipContent}>
                              <Text
                                style={[
                                  styles.tooltipTime,
                                  { color: palette.muted },
                                ]}
                              >
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

                    {hasData && oms && (
                      <View
                        style={[
                          styles.omsLegend,
                          { borderTopColor: palette.border },
                        ]}
                      >
                        <Text
                          style={[
                            styles.omsLegendTitle,
                            { color: palette.muted },
                          ]}
                        >
                          Référence OMS
                        </Text>
                        <View style={styles.omsLegendRow}>
                          <View style={styles.omsLegendItem}>
                            <View
                              style={[
                                styles.omsLegendDot,
                                { backgroundColor: omsPalette.lineP50 },
                              ]}
                            />
                            <Text
                              style={[
                                styles.omsLegendText,
                                { color: palette.muted },
                              ]}
                            >
                              Médiane
                            </Text>
                          </View>
                          <View style={styles.omsLegendItem}>
                            <View
                              style={[
                                styles.omsLegendBox,
                                { backgroundColor: omsPalette.bandLimit },
                              ]}
                            />
                            <Text
                              style={[
                                styles.omsLegendText,
                                { color: palette.muted },
                              ]}
                            >
                              Normal
                            </Text>
                          </View>
                          <View style={styles.omsLegendItem}>
                            <View
                              style={[
                                styles.omsLegendBox,
                                { backgroundColor: omsPalette.bandExtreme },
                              ]}
                            />
                            <Text
                              style={[
                                styles.omsLegendText,
                                { color: palette.muted },
                              ]}
                            >
                              Extrême
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                }
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: palette.muted }]}>
                      Aucune mesure pour le moment.
                    </Text>
                  </View>
                }
                ListFooterComponent={
                  hasMore ? (
                    <TouchableOpacity
                      style={[
                        styles.showMoreButton,
                        { borderColor: palette.border },
                      ]}
                      onPress={handleShowMore}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Afficher ${Math.min(PAGE_SIZE, entries.length - visibleCount)} mesures supplémentaires`}
                    >
                      <Text
                        style={[styles.showMoreText, { color: palette.tint }]}
                      >
                        Voir plus ({entries.length - visibleCount} restant
                        {entries.length - visibleCount > 1 ? "s" : ""})
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={palette.tint}
                      />
                    </TouchableOpacity>
                  ) : null
                }
              />
            </View>
          )}
        </GestureHandlerRootView>
      </SafeAreaView>

      <ConfirmModal
        visible={deleteConfirm.visible}
        title="Supprimer cette mesure ?"
        message="Cette action est irréversible."
        confirmText="Supprimer"
        backgroundColor={colors.background}
        textColor={colors.text}
        confirmButtonColor="#dc3545"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
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
    overflow: "visible",
    zIndex: 10,
  },
  metricTabs: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    gap: 6,
    marginBottom: 12,
  },
  metricTabIndicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  metricTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    zIndex: 1,
  },
  metricTabText: {
    fontSize: 12,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  summaryLabel: {
    fontSize: 11,
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
    overflow: "visible",
  },
  yAxisColumn: {
    position: "relative",
    width: CHART_AXIS_WIDTH,
    height: CHART_HEIGHT,
  },
  yAxisLabelWrap: {
    position: "absolute",
    left: 0,
    width: CHART_AXIS_WIDTH - 6,
    alignItems: "flex-end",
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
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 1000,
    width: 90,
    height: 54,
  },
  tooltipContent: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipTime: {
    fontSize: 10,
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
  lineLast: {
    backgroundColor: "transparent",
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
    gap: 0,
  },
  headerButton: {
    paddingVertical: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  omsLegend: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  omsLegendTitle: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  omsLegendRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  omsLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  omsLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  omsLegendBox: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  omsLegendText: {
    fontSize: 11,
    fontWeight: "500",
  },
  cardSwipeWrapper: {
    flex: 1,
  },
  deleteAction: {
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 14,
    marginHorizontal: 4,
    marginVertical: 7,
    gap: 4,
  },
  deleteActionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  showMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 14,
    borderStyle: "dashed",
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
