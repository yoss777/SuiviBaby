import { getChartColors, getNeutralColors } from "@/constants/dashboardColors";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import {
  Canvas,
  Group,
  LinearGradient,
  Path,
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
  sommeils: any[];
  repas?: any[];
  babyName?: string;
  colorScheme?: "light" | "dark";
  screenWidth?: number;
};

const DEFAULT_SCREEN_WIDTH = Dimensions.get("window").width - 40;
const CHART_HEIGHT = 210;
const CHART_PADDING = { top: 18, right: 18, bottom: 46, left: 50 };

const TAP_HINT_KEY = "sommeil_chart_tap_hint_shown";

const LOCATION_LABELS: Record<string, string> = {
  lit: "Lit",
  cododo: "Co-dodo",
  poussette: "Poussette",
  voiture: "Voiture",
  autre: "Autre",
};

const LOCATION_ICONS: Record<string, string> = {
  lit: "bed",
  cododo: "people-group",
  poussette: "baby-carriage",
  voiture: "car",
  autre: "location-dot",
};

const QUALITY_LABELS: Record<string, string> = {
  paisible: "Paisible",
  "agité": "Agité",
  mauvais: "Mauvais",
};

const MOMENT_LABELS: Record<string, string> = {
  matin: "Matin",
  "après-midi": "Après-midi",
  soir: "Soir",
  nuit: "Nuit",
};

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

function toDate(d: any): Date {
  if (d instanceof Timestamp) return d.toDate();
  if (d instanceof Date) return d;
  if (d && typeof d.toDate === "function") return d.toDate();
  if (d && d.seconds) return new Date(d.seconds * 1000);
  return new Date(d);
}

function getDurationMinutes(s: any): number {
  if (s.duree && typeof s.duree === "number") return s.duree;
  const start = s.heureDebut ? toDate(s.heureDebut) : null;
  const end = s.heureFin ? toDate(s.heureFin) : null;
  if (start && end) return Math.max(0, (end.getTime() - start.getTime()) / 60000);
  return 0;
}

function getMoment(s: any): string {
  const start = s.heureDebut ? toDate(s.heureDebut) : toDate(s.date);
  const h = start.getHours();
  if (h >= 6 && h < 12) return "matin";
  if (h >= 12 && h < 18) return "après-midi";
  if (h >= 18 && h < 22) return "soir";
  return "nuit";
}

function qualityScore(q: string | undefined): number {
  if (q === "paisible") return 3;
  if (q === "agité") return 2;
  if (q === "mauvais") return 1;
  return 2; // default moderate
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, "0")}`;
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

export default function SommeilChart({
  sommeils,
  repas = [],
  babyName,
  colorScheme = "light",
  screenWidth: screenWidthProp,
}: Props) {
  const SCREEN_WIDTH = screenWidthProp ?? DEFAULT_SCREEN_WIDTH;
  const CHART_WIDTH = SCREEN_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const C = getChartColors(colorScheme).sommeil;
  const nc = getNeutralColors(colorScheme);

  const [currentWeek, setCurrentWeek] = useState<Date>(getStartOfWeek(new Date()));
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [showTapHint, setShowTapHint] = useState(false);

  const tooltipX = useSharedValue(0);
  const tooltipY = useSharedValue(0);

  const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  useEffect(() => {
    AsyncStorage.getItem(TAP_HINT_KEY).then((val) => {
      if (!val) setShowTapHint(true);
    });
  }, []);

  useEffect(() => {
    setSelectedBarIndex(null);
  }, [currentWeek]);

  const isEmpty = !sommeils || sommeils.length === 0;

  const start = getStartOfWeek(currentWeek);
  const end = addWeeks(start, 1);

  // ============================================
  // WEEKLY DATA: nuit vs sieste stacked bars
  // ============================================
  const weeklyData = useMemo(() => {
    const data: Record<string, { nuitMinutes: number; siesteMinutes: number; count: number; nuitCount: number; siesteCount: number }> = {};
    jours.forEach((j) => {
      data[j] = { nuitMinutes: 0, siesteMinutes: 0, count: 0, nuitCount: 0, siesteCount: 0 };
    });

    sommeils.forEach((s) => {
      const d = toDate(s.date);
      if (d >= start && d < end) {
        const jour = d.toLocaleDateString("fr-FR", { weekday: "short" });
        const jourKey = jour.charAt(0).toUpperCase() + jour.slice(1, 3);
        const dur = getDurationMinutes(s);
        if (data[jourKey]) {
          data[jourKey].count += 1;
          if (s.isNap) {
            data[jourKey].siesteMinutes += dur;
            data[jourKey].siesteCount += 1;
          } else {
            data[jourKey].nuitMinutes += dur;
            data[jourKey].nuitCount += 1;
          }
        }
      }
    });
    return data;
  }, [sommeils, start, end]);

  // ============================================
  // METRICS
  // ============================================
  const metrics = useMemo(() => {
    const totalMinutes = jours.reduce((acc, j) => acc + weeklyData[j].nuitMinutes + weeklyData[j].siesteMinutes, 0);
    const totalNuitMinutes = jours.reduce((acc, j) => acc + weeklyData[j].nuitMinutes, 0);
    const totalSiesteMinutes = jours.reduce((acc, j) => acc + weeklyData[j].siesteMinutes, 0);
    const totalSessions = jours.reduce((acc, j) => acc + weeklyData[j].count, 0);
    const daysWithSleep = jours.filter((j) => weeklyData[j].count > 0).length;
    const avgPerDay = daysWithSleep > 0 ? totalMinutes / daysWithSleep : 0;
    const avgSiestesPerDay = daysWithSleep > 0
      ? jours.reduce((acc, j) => acc + weeklyData[j].siesteCount, 0) / daysWithSleep
      : 0;

    let longestNuit = 0;
    let longestNuitDay = "";
    jours.forEach((j) => {
      if (weeklyData[j].nuitMinutes > longestNuit) {
        longestNuit = weeklyData[j].nuitMinutes;
        longestNuitDay = j;
      }
    });

    return {
      totalMinutes,
      totalNuitMinutes,
      totalSiesteMinutes,
      totalSessions,
      daysWithSleep,
      avgPerDay,
      avgSiestesPerDay,
      longestNuit,
      longestNuitDay,
    };
  }, [weeklyData]);

  const totalWeekCount = metrics.totalSessions;

  // ============================================
  // LOCATION & MOMENT INSIGHTS ("Où bébé dort le mieux")
  // ============================================
  const locationInsights = useMemo(() => {
    const weekSommeils = sommeils.filter((s) => {
      const d = toDate(s.date);
      return d >= start && d < end;
    });

    // By location
    const byLocation: Record<string, { totalMinutes: number; totalQuality: number; count: number }> = {};
    // By moment
    const byMoment: Record<string, { totalMinutes: number; totalQuality: number; count: number }> = {};

    weekSommeils.forEach((s) => {
      const dur = getDurationMinutes(s);
      const q = qualityScore(s.quality);
      const loc = s.location || "autre";
      const mom = getMoment(s);

      if (!byLocation[loc]) byLocation[loc] = { totalMinutes: 0, totalQuality: 0, count: 0 };
      byLocation[loc].totalMinutes += dur;
      byLocation[loc].totalQuality += q;
      byLocation[loc].count += 1;

      if (!byMoment[mom]) byMoment[mom] = { totalMinutes: 0, totalQuality: 0, count: 0 };
      byMoment[mom].totalMinutes += dur;
      byMoment[mom].totalQuality += q;
      byMoment[mom].count += 1;
    });

    const locationRanking = Object.entries(byLocation)
      .map(([loc, data]) => ({
        location: loc,
        avgMinutes: data.count > 0 ? data.totalMinutes / data.count : 0,
        avgQuality: data.count > 0 ? data.totalQuality / data.count : 0,
        count: data.count,
      }))
      .sort((a, b) => b.avgQuality - a.avgQuality);

    const momentRanking = Object.entries(byMoment)
      .map(([mom, data]) => ({
        moment: mom,
        avgMinutes: data.count > 0 ? data.totalMinutes / data.count : 0,
        avgQuality: data.count > 0 ? data.totalQuality / data.count : 0,
        count: data.count,
      }))
      .sort((a, b) => b.avgQuality - a.avgQuality);

    const bestLocation = locationRanking.length > 0 ? locationRanking[0] : null;
    const bestMoment = momentRanking.length > 0 ? momentRanking[0] : null;

    // Quality distribution
    const qualityDist = { paisible: 0, "agité": 0, mauvais: 0 };
    weekSommeils.forEach((s) => {
      const q = s.quality || "paisible";
      if (q in qualityDist) qualityDist[q as keyof typeof qualityDist] += 1;
    });

    return { locationRanking, momentRanking, bestLocation, bestMoment, qualityDist, totalEvents: weekSommeils.length };
  }, [sommeils, start, end]);

  // ============================================
  // 5.1 CORRELATION REPAS / SOMMEIL
  // ============================================
  const mealSleepCorrelation = useMemo(() => {
    if (repas.length === 0 || sommeils.length === 0) return null;

    // Find nighttime sleeps this week (isNap === false)
    const nightSleeps = sommeils.filter((s) => {
      const d = toDate(s.date);
      return d >= start && d < end && !s.isNap;
    });
    if (nightSleeps.length === 0) return null;

    const results: { gap: number; quality: number }[] = [];
    nightSleeps.forEach((sleep) => {
      const sleepStart = sleep.heureDebut ? toDate(sleep.heureDebut) : toDate(sleep.date);
      // Find last meal before this sleep (within 6h window)
      const sixHoursBefore = new Date(sleepStart.getTime() - 6 * 3600000);
      const mealsBefore = repas
        .map((r) => ({ ...r, d: toDate(r.date) }))
        .filter((r) => r.d >= sixHoursBefore && r.d < sleepStart)
        .sort((a, b) => b.d.getTime() - a.d.getTime());

      if (mealsBefore.length > 0) {
        const lastMeal = mealsBefore[0];
        const gapMinutes = (sleepStart.getTime() - lastMeal.d.getTime()) / 60000;
        results.push({ gap: gapMinutes, quality: qualityScore(sleep.quality) });
      }
    });

    if (results.length === 0) return null;
    const avgGap = results.reduce((a, r) => a + r.gap, 0) / results.length;
    const avgQuality = results.reduce((a, r) => a + r.quality, 0) / results.length;

    return { avgGapMinutes: avgGap, avgQuality, sampleSize: results.length };
  }, [repas, sommeils, start, end]);

  // ============================================
  // 5.3 WEEK-OVER-WEEK COMPARISON
  // ============================================
  const prevWeekStart = useMemo(() => addWeeks(start, -1), [start]);
  const prevWeekEnd = useMemo(() => new Date(start.getTime()), [start]);

  const prevWeekData = useMemo(() => {
    const data: Record<string, { total: number }> = {};
    jours.forEach((j) => { data[j] = { total: 0 }; });

    sommeils.forEach((s) => {
      const d = toDate(s.date);
      if (d >= prevWeekStart && d < prevWeekEnd) {
        const jour = d.toLocaleDateString("fr-FR", { weekday: "short" });
        const jourKey = jour.charAt(0).toUpperCase() + jour.slice(1, 3);
        if (data[jourKey]) {
          data[jourKey].total += getDurationMinutes(s);
        }
      }
    });
    return data;
  }, [sommeils, prevWeekStart, prevWeekEnd]);

  const weekTrend = useMemo(() => {
    const currentTotal = metrics.totalMinutes;
    const prevTotal = jours.reduce((acc, j) => acc + prevWeekData[j].total, 0);
    if (prevTotal === 0) return null;
    const pct = Math.round(((currentTotal - prevTotal) / prevTotal) * 100);
    return { pct, direction: pct >= 0 ? "up" : "down" as const, prevTotal };
  }, [metrics.totalMinutes, prevWeekData]);

  // ============================================
  // 5.6 SMART SLEEP TIP
  // ============================================
  const smartTip = useMemo(() => {
    if (sommeils.length === 0) return null;
    const name = babyName || "bébé";

    // Check last 3 days quality trend
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const recentSleeps = sommeils
      .filter((s) => {
        const d = toDate(s.date);
        return d >= threeDaysAgo && d <= today;
      })
      .map((s) => ({ quality: qualityScore(s.quality), date: toDate(s.date) }));

    if (recentSleeps.length < 3) return null;

    const avgRecent = recentSleeps.reduce((a, s) => a + s.quality, 0) / recentSleeps.length;

    if (avgRecent <= 1.5) {
      return `Le sommeil de ${name} semble agité depuis quelques jours. Vérifiez la température de la chambre (18-20°C) et le bruit ambiant.`;
    }
    if (avgRecent >= 2.7) {
      return `${name} dort bien ces derniers jours ! Continuez sur ce bon rythme.`;
    }
    return null;
  }, [sommeils, babyName]);

  // ============================================
  // CHART BARS (stacked nuit + sieste)
  // ============================================
  const chartAreaHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const barWidth = CHART_WIDTH / (jours.length * 1.45);
  const barSpacing = barWidth / 2.2;

  const maxMinutes = useMemo(() => {
    return Math.max(
      ...jours.map((j) => weeklyData[j].nuitMinutes + weeklyData[j].siesteMinutes),
      ...jours.map((j) => prevWeekData[j].total),
      60, // minimum 1h scale
    );
  }, [weeklyData, prevWeekData]);

  const bars = useMemo(() => {
    return jours.map((jour, index) => {
      const nuit = weeklyData[jour].nuitMinutes;
      const sieste = weeklyData[jour].siesteMinutes;
      const total = nuit + sieste;
      const x = CHART_PADDING.left + index * (barWidth + barSpacing);
      const totalHeight = maxMinutes > 0 ? (total / maxMinutes) * chartAreaHeight : 0;
      const nuitHeight = total > 0 ? (nuit / total) * totalHeight : 0;
      const siesteHeight = total > 0 ? (sieste / total) * totalHeight : 0;
      const baseY = CHART_PADDING.top + chartAreaHeight;

      // Ghost bar (prev week)
      const prevTotal = prevWeekData[jour].total;
      const prevHeight = maxMinutes > 0 ? (prevTotal / maxMinutes) * chartAreaHeight : 0;

      return {
        jour,
        total,
        nuit,
        sieste,
        x,
        width: barWidth,
        baseY,
        totalHeight: Math.max(totalHeight, total > 0 ? 2 : 0),
        nuitHeight,
        siesteHeight,
        isMax: total === Math.max(...jours.map((j) => weeklyData[j].nuitMinutes + weeklyData[j].siesteMinutes)) && total > 0,
        nuitCount: weeklyData[jour].nuitCount,
        siesteCount: weeklyData[jour].siesteCount,
        prevTotal,
        prevHeight,
      };
    });
  }, [weeklyData, prevWeekData, barWidth, barSpacing, chartAreaHeight, maxMinutes]);

  const yAxisLabels = useMemo(() => {
    const steps = 4;
    const maxVal = maxMinutes || 60;
    return Array.from({ length: steps }, (_, i) => {
      const value = Math.round((maxVal / (steps - 1)) * i);
      const y = CHART_PADDING.top + chartAreaHeight - (value / maxVal) * chartAreaHeight;
      return { value, y, label: formatHours(value) };
    });
  }, [maxMinutes, chartAreaHeight]);

  // ============================================
  // GESTURES
  // ============================================
  const findBarAtPosition = useCallback((x: number) => {
    for (let i = 0; i < bars.length; i += 1) {
      const bar = bars[i];
      if (x >= bar.x && x <= bar.x + bar.width) return i;
    }
    return null;
  }, [bars]);

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => {
      if (showTapHint) {
        setShowTapHint(false);
        AsyncStorage.setItem(TAP_HINT_KEY, "1");
      }
      const barIndex = findBarAtPosition(event.x);
      if (barIndex !== null && bars[barIndex].total > 0) {
        setSelectedBarIndex((prev) => {
          if (prev === barIndex) return null;
          tooltipX.value = withSpring(bars[barIndex].x + bars[barIndex].width / 2 - 60);
          tooltipY.value = withSpring(bars[barIndex].baseY - bars[barIndex].totalHeight - 70);
          return barIndex;
        });
      } else {
        setSelectedBarIndex(null);
      }
    });

  const animatedTooltipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tooltipX.value }, { translateY: tooltipY.value }],
  }));

  // ============================================
  // Quality color helper
  // ============================================
  const getQualityColor = useCallback((quality: string) => {
    if (quality === "paisible") return C.qualityPaisible;
    if (quality === "agité") return C.qualityAgite;
    return C.qualityMauvais;
  }, [C]);

  const getLocationColor = useCallback((loc: string) => {
    const map: Record<string, string> = {
      lit: C.locationLit,
      cododo: C.locationCododo,
      poussette: C.locationPoussette,
      voiture: C.locationVoiture,
    };
    return map[loc] || C.locationAutre;
  }, [C]);

  // ============================================
  // RENDER
  // ============================================
  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: nc.background }]}>
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="bed" size={64} color={nc.textMuted} />
          <Text style={[styles.emptyTitle, { color: nc.textNormal }]}>
            Aucune donnée de sommeil
          </Text>
          <Text style={[styles.emptySubtitle, { color: nc.textLight }]}>
            Commencez à enregistrer le sommeil pour voir les statistiques
          </Text>
          <TouchableOpacity
            style={[styles.emptyCta, { backgroundColor: C.purple }]}
            onPress={() => router.replace("/baby/chrono")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un sommeil"
          >
            <FontAwesome name="plus" size={14} color={nc.white} />
            <Text style={styles.emptyCtaText}>Ajouter un sommeil</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={[
            styles.section,
            {
              backgroundColor: C.surface,
              shadowColor: colorScheme === "dark" ? "transparent" : "#000",
              borderColor: colorScheme === "dark" ? nc.border : "transparent",
              borderWidth: colorScheme === "dark" ? 1 : 0,
            },
          ]}
        >
          {/* HEADER */}
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: C.iconBadgeBg }]}>
              <FontAwesome name="bed" size={18} color={C.purple} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.sectionTitle, { color: C.ink }]}>
                Statistiques du sommeil
              </Text>
              <Text style={[styles.sectionSubtitle, { color: C.muted }]}>
                {`${start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} - ${new Date(end.getTime() - 1).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
              </Text>
            </View>
          </View>

          {/* NAVIGATION */}
          <View style={styles.navigationRow}>
            <TouchableOpacity
              style={[styles.navButton, { backgroundColor: C.navButtonBg, borderColor: C.border }]}
              onPress={() => setCurrentWeek(addWeeks(currentWeek, -1))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Semaine précédente"
            >
              <FontAwesome name="chevron-left" size={14} color={C.muted} />
              <Text style={[styles.navText, { color: C.muted }]}>Préc.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.todayButton, { backgroundColor: C.purple }]}
              onPress={() => setCurrentWeek(getStartOfWeek(new Date()))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Revenir à cette semaine"
            >
              <Text style={styles.todayText}>Cette semaine</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navButton, { backgroundColor: C.navButtonBg, borderColor: C.border }]}
              onPress={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Semaine suivante"
            >
              <Text style={[styles.navText, { color: C.muted }]}>Suiv.</Text>
              <FontAwesome name="chevron-right" size={14} color={C.muted} />
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
              {/* METRICS */}
              <View style={styles.metricsRow}>
                <View style={[styles.metricCard, { backgroundColor: C.metricBg, borderColor: C.border }]}>
                  <Text style={[styles.metricLabel, { color: C.muted }]}>Moyenne/jour</Text>
                  <Text style={[styles.metricValue, { color: C.purpleDeep }]}>
                    {formatHours(metrics.avgPerDay)}
                  </Text>
                </View>
                <View style={[styles.metricCard, { backgroundColor: C.metricBg, borderColor: C.border }]}>
                  <Text style={[styles.metricLabel, { color: C.muted }]}>Siestes/jour</Text>
                  <Text style={[styles.metricValue, { color: C.purpleDeep }]}>
                    {Math.round(metrics.avgSiestesPerDay * 10) / 10}
                  </Text>
                </View>
                {metrics.longestNuit > 0 && (
                  <View style={[styles.metricCard, { backgroundColor: C.metricHighlightBg, borderColor: C.metricHighlightBorder }]}>
                    <Text style={[styles.metricLabel, { color: C.muted }]}>Plus longue nuit</Text>
                    <Text style={[styles.metricValue, { color: C.purpleDeep }]}>
                      {formatHours(metrics.longestNuit)}
                    </Text>
                  </View>
                )}
              </View>

              {/* LEGEND */}
              <View style={styles.legendRow}>
                <View style={styles.legendList}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: C.navy }]} />
                    <Text style={[styles.legendLabel, { color: C.muted }]}>Nuit</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: C.lavender }]} />
                    <Text style={[styles.legendLabel, { color: C.muted }]}>Siestes</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: C.emptyBar, opacity: 0.5 }]} />
                    <Text style={[styles.legendLabel, { color: C.muted }]}>Sem. préc.</Text>
                  </View>
                </View>
                {weekTrend && (
                  <View style={styles.trendBadge}>
                    <FontAwesome
                      name={weekTrend.direction === "up" ? "arrow-up" : "arrow-down"}
                      size={10}
                      color={weekTrend.direction === "up" ? C.qualityPaisible : C.qualityMauvais}
                    />
                    <Text style={[styles.trendText, {
                      color: weekTrend.direction === "up" ? C.qualityPaisible : C.qualityMauvais,
                    }]}>
                      {Math.abs(weekTrend.pct)}%
                    </Text>
                  </View>
                )}
              </View>

              {/* CHART */}
              <View style={styles.chartContainer}>
                <View style={styles.yAxisContainer}>
                  {yAxisLabels.map((label, index) => (
                    <View key={index} style={[styles.yAxisLabel, { top: label.y - 8 }]}>
                      <Text style={[styles.yAxisText, { color: C.muted }]}>{label.label}</Text>
                    </View>
                  ))}
                </View>

                <GestureDetector gesture={tapGesture}>
                  <Canvas
                    style={[styles.canvas, { width: SCREEN_WIDTH }]}
                    accessibilityLabel="Graphique du sommeil de la semaine. Appuyez sur une barre pour voir les détails."
                  >
                    <RoundedRect
                      x={CHART_PADDING.left}
                      y={CHART_PADDING.top}
                      width={CHART_WIDTH}
                      height={chartAreaHeight}
                      r={12}
                      color={C.surface}
                    >
                      <LinearGradient
                        start={vec(CHART_PADDING.left, CHART_PADDING.top)}
                        end={vec(CHART_PADDING.left, CHART_HEIGHT - CHART_PADDING.bottom)}
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

                    {/* Ghost bars (prev week) */}
                    {bars.map((bar, index) => {
                      if (bar.prevHeight <= 0) return null;
                      const ghostY = bar.baseY - bar.prevHeight;
                      return (
                        <RoundedRect
                          key={`ghost-${index}`}
                          x={bar.x}
                          y={ghostY}
                          width={bar.width}
                          height={Math.max(bar.prevHeight, 2)}
                          r={6}
                          color={C.emptyBar}
                          opacity={0.5}
                        />
                      );
                    })}

                    {bars.map((bar, index) => {
                      if (bar.total === 0) {
                        return (
                          <RoundedRect
                            key={`bar-${index}`}
                            x={bar.x}
                            y={bar.baseY - 2}
                            width={bar.width}
                            height={2}
                            r={1}
                            color={C.emptyBar}
                          />
                        );
                      }

                      const nuitY = bar.baseY - bar.nuitHeight;
                      const siesteY = nuitY - bar.siesteHeight;
                      const R = 6;
                      const hasNuit = bar.nuitHeight > 0;
                      const hasSieste = bar.siesteHeight > 0;

                      return (
                        <Group key={`bar-${index}`}>
                          {hasNuit && (
                            hasSieste ? (
                              <Path
                                path={makeRRect(bar.x, nuitY, bar.width, Math.max(bar.nuitHeight, 2), 0, 0, R, R)}
                                color={C.navy}
                              />
                            ) : (
                              <RoundedRect
                                x={bar.x}
                                y={nuitY}
                                width={bar.width}
                                height={Math.max(bar.nuitHeight, 2)}
                                r={R}
                                color={C.navy}
                              >
                                {bar.isMax && (
                                  <Shadow dx={0} dy={2} blur={6} color={`${C.purple}59`} />
                                )}
                              </RoundedRect>
                            )
                          )}
                          {hasSieste && (
                            hasNuit ? (
                              <Path
                                path={makeRRect(bar.x, siesteY, bar.width, Math.max(bar.siesteHeight, 2), R, R, 0, 0)}
                                color={C.lavender}
                              >
                                {bar.isMax && (
                                  <Shadow dx={0} dy={2} blur={6} color={`${C.purple}59`} />
                                )}
                              </Path>
                            ) : (
                              <RoundedRect
                                x={bar.x}
                                y={siesteY}
                                width={bar.width}
                                height={Math.max(bar.siesteHeight, 2)}
                                r={R}
                                color={C.lavender}
                              >
                                {bar.isMax && (
                                  <Shadow dx={0} dy={2} blur={6} color={`${C.purple}59`} />
                                )}
                              </RoundedRect>
                            )
                          )}
                        </Group>
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
                      { backgroundColor: C.tooltipBg, borderColor: C.tooltipBorder },
                    ]}
                  >
                    <Text style={[styles.tooltipDay, { color: C.muted }]}>
                      {bars[selectedBarIndex].jour}
                    </Text>
                    <Text style={[styles.tooltipValue, { color: C.purpleDeep }]}>
                      {formatHours(bars[selectedBarIndex].total)}
                    </Text>
                    <Text style={[styles.tooltipDetail, { color: C.muted }]}>
                      {bars[selectedBarIndex].nuitCount > 0
                        ? `Nuit: ${formatHours(bars[selectedBarIndex].nuit)}`
                        : ""}
                      {bars[selectedBarIndex].nuitCount > 0 && bars[selectedBarIndex].siesteCount > 0
                        ? "\n"
                        : ""}
                      {bars[selectedBarIndex].siesteCount > 0
                        ? `${bars[selectedBarIndex].siesteCount} sieste${bars[selectedBarIndex].siesteCount > 1 ? "s" : ""}: ${formatHours(bars[selectedBarIndex].sieste)}`
                        : ""}
                    </Text>
                  </Animated.View>
                )}

                <View style={styles.xAxisContainer}>
                  {jours.map((jour, index) => (
                    <Text
                      key={`xlabel-${index}`}
                      style={[styles.xAxisText, { left: bars[index].x + bars[index].width / 2 - 15, color: C.muted }]}
                    >
                      {jour}
                    </Text>
                  ))}
                </View>
              </View>

              {/* STATS ROW */}
              <View style={[styles.statsContainer, { borderTopColor: C.border }]}>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <FontAwesome name="moon" size={14} color={C.navy} />
                    <Text style={[styles.statValue, { color: C.navy }]}>
                      {formatHours(metrics.totalNuitMinutes)}
                    </Text>
                    <Text style={[styles.statLabel, { color: C.muted }]}>Total nuit</Text>
                  </View>
                  <View style={styles.statItem}>
                    <FontAwesome name="sun" size={14} color={C.lavender} />
                    <Text style={[styles.statValue, { color: C.lavender }]}>
                      {formatHours(metrics.totalSiesteMinutes)}
                    </Text>
                    <Text style={[styles.statLabel, { color: C.muted }]}>Total siestes</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: C.purpleDeep }]}>
                      {metrics.totalSessions}
                    </Text>
                    <Text style={[styles.statLabel, { color: C.muted }]}>
                      Session{metrics.totalSessions > 1 ? "s" : ""}
                    </Text>
                  </View>
                  {metrics.longestNuit > 0 && (
                    <View style={styles.statItem}>
                      <FontAwesome name="trophy" size={16} color={C.purple} />
                      <Text style={[styles.statValue, { color: C.purple }]}>
                        {metrics.longestNuitDay}
                      </Text>
                      <Text style={[styles.statLabel, { color: C.muted }]}>
                        Record: {formatHours(metrics.longestNuit)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* WHERE BABY SLEEPS BEST */}
              {locationInsights.totalEvents > 0 && (
                <View style={[styles.insightsSection, { borderTopColor: C.border }]}>
                  <Text style={[styles.insightsSectionTitle, { color: C.ink }]}>
                    Où bébé dort le mieux
                  </Text>

                  {/* Best spot highlight */}
                  {locationInsights.bestLocation && (
                    <View style={[styles.bestSpotCard, { backgroundColor: C.metricHighlightBg, borderColor: C.metricHighlightBorder }]}>
                      <FontAwesome
                        name={LOCATION_ICONS[locationInsights.bestLocation.location] || "location-dot"}
                        size={20}
                        color={C.purple}
                      />
                      <View style={styles.bestSpotContent}>
                        <Text style={[styles.bestSpotTitle, { color: C.purpleDeep }]}>
                          Meilleur endroit : {LOCATION_LABELS[locationInsights.bestLocation.location] || locationInsights.bestLocation.location}
                        </Text>
                        <Text style={[styles.bestSpotDetail, { color: C.muted }]}>
                          {formatHours(locationInsights.bestLocation.avgMinutes)} en moyenne · Score qualité {Math.round(locationInsights.bestLocation.avgQuality * 10) / 10}/3
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Location ranking bars */}
                  {locationInsights.locationRanking.length > 0 && (
                    <View style={styles.rankingContainer}>
                      {locationInsights.locationRanking.map((loc) => {
                        const maxQ = 3;
                        const pct = (loc.avgQuality / maxQ) * 100;
                        return (
                          <View key={loc.location} style={styles.rankingRow}>
                            <View style={styles.rankingLabel}>
                              <FontAwesome
                                name={LOCATION_ICONS[loc.location] || "location-dot"}
                                size={14}
                                color={getLocationColor(loc.location)}
                              />
                              <Text style={[styles.rankingText, { color: C.ink }]}>
                                {LOCATION_LABELS[loc.location] || loc.location}
                              </Text>
                            </View>
                            <View style={[styles.rankingBarBg, { backgroundColor: C.emptyBar }]}>
                              <View
                                style={[
                                  styles.rankingBarFill,
                                  {
                                    width: `${Math.max(pct, 5)}%`,
                                    backgroundColor: getLocationColor(loc.location),
                                  },
                                ]}
                              />
                            </View>
                            <Text style={[styles.rankingValue, { color: C.muted }]}>
                              {loc.count}× · {formatHours(loc.avgMinutes)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Moment ranking */}
                  {locationInsights.momentRanking.length > 0 && (
                    <>
                      <Text style={[styles.insightsSubTitle, { color: C.ink }]}>
                        Meilleur moment
                      </Text>
                      <View style={styles.momentRow}>
                        {locationInsights.momentRanking.map((mom, idx) => (
                          <View
                            key={mom.moment}
                            style={[
                              styles.momentCard,
                              {
                                backgroundColor: idx === 0 ? C.metricHighlightBg : C.metricBg,
                                borderColor: idx === 0 ? C.metricHighlightBorder : C.border,
                              },
                            ]}
                          >
                            <Text style={[styles.momentLabel, { color: C.muted }]}>
                              {MOMENT_LABELS[mom.moment] || mom.moment}
                            </Text>
                            <Text style={[styles.momentValue, { color: idx === 0 ? C.purpleDeep : C.ink }]}>
                              {Math.round(mom.avgQuality * 10) / 10}/3
                            </Text>
                            <Text style={[styles.momentDetail, { color: C.muted }]}>
                              {formatHours(mom.avgMinutes)} moy.
                            </Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Quality distribution */}
                  {locationInsights.totalEvents > 0 && (
                    <>
                      <Text style={[styles.insightsSubTitle, { color: C.ink }]}>
                        Qualité du sommeil
                      </Text>
                      <View style={styles.qualityRow}>
                        {(["paisible", "agité", "mauvais"] as const).map((q) => {
                          const count = locationInsights.qualityDist[q];
                          const total = locationInsights.totalEvents;
                          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                          return (
                            <View key={q} style={styles.qualityItem}>
                              <View style={[styles.qualityDot, { backgroundColor: getQualityColor(q) }]} />
                              <Text style={[styles.qualityLabel, { color: C.ink }]}>
                                {QUALITY_LABELS[q]}
                              </Text>
                              <Text style={[styles.qualityPct, { color: C.muted }]}>
                                {pct}%
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* 5.1 CORRELATION REPAS / SOMMEIL */}
              {mealSleepCorrelation && (
                <View style={[styles.correlationCard, { backgroundColor: C.metricBg, borderColor: C.border }]}>
                  <FontAwesome name="utensils" size={16} color={C.lavender} />
                  <View style={styles.correlationContent}>
                    <Text style={[styles.correlationTitle, { color: C.ink }]}>
                      Dernier repas avant la nuit
                    </Text>
                    <Text style={[styles.correlationDetail, { color: C.muted }]}>
                      En moyenne {formatHours(mealSleepCorrelation.avgGapMinutes)} avant le coucher · Qualité {Math.round(mealSleepCorrelation.avgQuality * 10) / 10}/3
                    </Text>
                  </View>
                </View>
              )}

              {/* 5.6 SMART TIP */}
              {smartTip && (
                <View style={[styles.smartTipCard, { backgroundColor: C.insightBg }]}>
                  <FontAwesome name="wand-magic-sparkles" size={14} color={C.purple} />
                  <Text style={[styles.smartTipText, { color: C.insightText }]}>
                    {smartTip}
                  </Text>
                </View>
              )}

              {/* INSIGHT TEXT */}
              {totalWeekCount > 0 && (
                <View style={[styles.insightContainer, { backgroundColor: C.insightBg }]}>
                  <FontAwesome name="lightbulb" size={16} color={C.purple} />
                  <View style={styles.insightContent}>
                    <Text style={[styles.insightTitle, { color: C.purpleDeep }]}>
                      Aperçu sommeil de la semaine
                    </Text>
                    <Text style={[styles.insightText, { color: C.insightText }]}>
                      {`${formatHours(metrics.totalMinutes)} de sommeil total cette semaine (${formatHours(metrics.totalNuitMinutes)} la nuit, ${formatHours(metrics.totalSiesteMinutes)} en siestes). `}
                      {metrics.avgSiestesPerDay > 0
                        ? `Environ ${Math.round(metrics.avgSiestesPerDay * 10) / 10} sieste${metrics.avgSiestesPerDay > 1 ? "s" : ""} par jour. `
                        : ""}
                      {locationInsights.bestLocation
                        ? `Le meilleur endroit pour dormir : ${LOCATION_LABELS[locationInsights.bestLocation.location] || locationInsights.bestLocation.location}.`
                        : ""}
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
    color: "white",
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
    color: "white", // On colored bg, always white
    fontSize: 13,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
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
    width: 120,
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
    textAlign: "center",
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
  // Where baby sleeps best section
  insightsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  insightsSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  insightsSubTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  bestSpotCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  bestSpotContent: {
    flex: 1,
  },
  bestSpotTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  bestSpotDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  rankingContainer: {
    gap: 8,
  },
  rankingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rankingLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: 100,
  },
  rankingText: {
    fontSize: 13,
    fontWeight: "600",
  },
  rankingBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  rankingBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  rankingValue: {
    fontSize: 11,
    width: 80,
    textAlign: "right",
  },
  momentRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  momentCard: {
    flex: 1,
    minWidth: 70,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  momentLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  momentValue: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  momentDetail: {
    fontSize: 10,
    marginTop: 2,
  },
  qualityRow: {
    flexDirection: "row",
    gap: 16,
  },
  qualityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  qualityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  qualityLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  qualityPct: {
    fontSize: 13,
    fontWeight: "700",
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
  // Trend badge
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  trendText: {
    fontSize: 12,
    fontWeight: "700",
  },
  // Correlation card
  correlationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  correlationContent: {
    flex: 1,
  },
  correlationTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  correlationDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  // Smart tip
  smartTipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  smartTipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
