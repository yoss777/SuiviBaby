import { getChartColors, getNeutralColors } from "@/constants/dashboardColors";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Timestamp } from "firebase/firestore";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
} from "react-native-reanimated";

type Props = {
  pompages: any[];
  colorScheme?: "light" | "dark";
  screenWidth?: number;
};

const DEFAULT_SCREEN_WIDTH = Dimensions.get("window").width - 40;
const CHART_HEIGHT = 210;
const CHART_PADDING = { top: 18, right: 18, bottom: 42, left: 50 };

const TAP_HINT_KEY = "pompages_chart_tap_hint_shown";

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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

function createSmoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";

  const path = Skia.Path.Make();
  path.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i += 1) {
    const curr = points[i];
    const next = points[i + 1];
    const cpX = (curr.x + next.x) / 2;
    path.quadTo(curr.x, curr.y, cpX, (curr.y + next.y) / 2);
  }

  if (points.length > 1) {
    const last = points[points.length - 1];
    path.lineTo(last.x, last.y);
  }

  return path;
}

function createFillPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";

  const path = Skia.Path.Make();
  const baseY = CHART_HEIGHT - CHART_PADDING.bottom;

  path.moveTo(points[0].x, baseY);
  path.lineTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i += 1) {
    const curr = points[i];
    const next = points[i + 1];
    const cpX = (curr.x + next.x) / 2;
    path.quadTo(curr.x, curr.y, cpX, (curr.y + next.y) / 2);
  }

  const last = points[points.length - 1];
  path.lineTo(last.x, last.y);
  path.lineTo(last.x, baseY);
  path.close();

  return path;
}

export default function PompagesChart({
  pompages,
  colorScheme = "light",
  screenWidth: screenWidthProp,
}: Props) {
  const SCREEN_WIDTH = screenWidthProp ?? DEFAULT_SCREEN_WIDTH;
  const CHART_WIDTH = SCREEN_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const C = getChartColors(colorScheme).pompages;
  const nc = getNeutralColors(colorScheme);

  const [currentDay, setCurrentDay] = useState<Date>(startOfDay(new Date()));
  const [currentWeek, setCurrentWeek] = useState<Date>(
    getStartOfWeek(new Date()),
  );
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  );
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [showTapHint, setShowTapHint] = useState(false);

  const selectedX = useSharedValue(0);
  const selectedY = useSharedValue(0);
  const barTooltipX = useSharedValue(0);
  const barTooltipY = useSharedValue(0);

  useEffect(() => {
    AsyncStorage.getItem(TAP_HINT_KEY).then((val) => {
      if (!val) setShowTapHint(true);
    });
  }, []);

  useEffect(() => {
    setSelectedPointIndex(null);
  }, [currentDay]);

  useEffect(() => {
    setSelectedBarIndex(null);
  }, [currentWeek]);

  const isEmpty = !pompages || pompages.length === 0;

  const dailyPompages = useMemo(() => {
    return pompages
      .map((p) => ({
        ...p,
        dateObj:
          p.date instanceof Timestamp ? p.date.toDate() : new Date(p.date),
        totalQuantite: (p.quantiteDroite || 0) + (p.quantiteGauche || 0),
      }))
      .filter((p) => startOfDay(p.dateObj).getTime() === currentDay.getTime())
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  }, [pompages, currentDay]);

  const dailyValues = dailyPompages.map((p) => p.totalQuantite);
  const dailyLabels = dailyPompages.map((p) =>
    p.dateObj.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  const maxDaily = Math.max(...dailyValues, 0);
  const dailyTotal = dailyValues.reduce((a, b) => a + b, 0);
  const dailyAverage =
    dailyValues.length > 0 ? Math.round(dailyTotal / dailyValues.length) : 0;

  const yScale = (value: number) => {
    const chartAreaHeight =
      CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const maxValue = maxDaily || 1;
    return CHART_PADDING.top + chartAreaHeight * (1 - value / maxValue);
  };

  const xScale = (index: number) => {
    const spacing =
      CHART_WIDTH / (dailyValues.length > 1 ? dailyValues.length - 1 : 1);
    return CHART_PADDING.left + index * spacing;
  };

  const chartPoints = useMemo(() => {
    return dailyValues.map((value, index) => ({
      x: xScale(index),
      y: yScale(value),
      value,
      label: dailyLabels[index],
    }));
  }, [dailyValues, dailyLabels]);

  const linePath = useMemo(() => createSmoothPath(chartPoints), [chartPoints]);
  const fillPath = useMemo(() => createFillPath(chartPoints), [chartPoints]);

  const yAxisLabels = useMemo(() => {
    const steps = 4;
    const maxValue = maxDaily || 1;
    return Array.from({ length: steps }, (_, i) => {
      const value = Math.round((maxValue / (steps - 1)) * i);
      return {
        value,
        y: yScale(value),
      };
    }).reverse();
  }, [maxDaily]);

  const findNearestPoint = (tapX: number, tapY: number) => {
    let nearest = 0;
    let minDistance = Infinity;

    chartPoints.forEach((point, index) => {
      const distance = Math.hypot(point.x - tapX, point.y - tapY);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = index;
      }
    });

    return minDistance < 44 ? nearest : null;
  };

  const dismissHint = () => {
    if (showTapHint) {
      setShowTapHint(false);
      AsyncStorage.setItem(TAP_HINT_KEY, "1");
    }
  };

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => {
      dismissHint();
      const pointIndex = findNearestPoint(event.x, event.y);
      setSelectedPointIndex(pointIndex);

      if (pointIndex !== null) {
        selectedX.value = withSpring(chartPoints[pointIndex].x);
        selectedY.value = withSpring(chartPoints[pointIndex].y);
      }
    });

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((event) => {
      dismissHint();
      const pointIndex = findNearestPoint(event.x, event.y);
      if (pointIndex !== null && pointIndex !== selectedPointIndex) {
        setSelectedPointIndex(pointIndex);
        selectedX.value = chartPoints[pointIndex].x;
        selectedY.value = chartPoints[pointIndex].y;
      }
    });

  const pointGesture = Gesture.Race(tapGesture, panGesture);

  const animatedTooltipStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: selectedX.value - 42 },
      { translateY: selectedY.value - 74 },
    ],
  }));

  const weekStart = getStartOfWeek(currentWeek);
  const weekEnd = addWeeks(weekStart, 1);
  const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const weeklyData: Record<string, number> = {
    Lun: 0,
    Mar: 0,
    Mer: 0,
    Jeu: 0,
    Ven: 0,
    Sam: 0,
    Dim: 0,
  };

  pompages.forEach((p) => {
    const d = p.date instanceof Timestamp ? p.date.toDate() : new Date(p.date);
    if (d >= weekStart && d < weekEnd) {
      const jour = d.toLocaleDateString("fr-FR", { weekday: "short" });
      const jourKey = jour.charAt(0).toUpperCase() + jour.slice(1, 3);
      const total = (p.quantiteDroite || 0) + (p.quantiteGauche || 0);
      if (weeklyData[jourKey] !== undefined) {
        weeklyData[jourKey] += total;
      }
    }
  });

  const weeklyValues = jours.map((j) => weeklyData[j]);
  const maxWeekly = Math.max(...weeklyValues, 0);
  const weeklyTotal = weeklyValues.reduce((a, b) => a + b, 0);
  const daysWithWeeklyData = weeklyValues.filter((v) => v > 0).length;
  const weeklyAverageLabel = `Moyenne/jour (${daysWithWeeklyData}j)`;
  const weeklyAverage =
    weeklyTotal > 0 && daysWithWeeklyData > 0
      ? Math.round(weeklyTotal / daysWithWeeklyData)
      : 0;
  const bestDay = jours[weeklyValues.indexOf(maxWeekly)];

  const weeklyBarWidth = CHART_WIDTH / (jours.length * 1.45);
  const weeklyBarSpacing = weeklyBarWidth / 2.2;
  const weeklyChartHeight =
    CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const weeklyBars = useMemo(() => {
    return jours.map((jour, index) => {
      const value = weeklyValues[index];
      const barHeight =
        maxWeekly > 0 ? (value / maxWeekly) * weeklyChartHeight : 0;
      const x =
        CHART_PADDING.left + index * (weeklyBarWidth + weeklyBarSpacing);
      const y = CHART_PADDING.top + (weeklyChartHeight - barHeight);
      const isMax = value === maxWeekly && value > 0;
      return {
        jour,
        value,
        x,
        y,
        width: weeklyBarWidth,
        height: Math.max(barHeight, 2),
        color: isMax ? C.gold : value > 0 ? C.green : C.emptyBar,
        isMax,
      };
    });
  }, [weeklyValues, maxWeekly, C]);

  const weeklyYAxisLabels = useMemo(() => {
    const steps = 4;
    const maxValue = maxWeekly || 1;
    return Array.from({ length: steps }, (_, i) => {
      const value = Math.round((maxValue / (steps - 1)) * i);
      const y =
        CHART_PADDING.top +
        weeklyChartHeight -
        (value / maxValue) * weeklyChartHeight;
      return { value, y };
    });
  }, [maxWeekly]);

  const findBarAtPosition = (x: number) => {
    for (let i = 0; i < weeklyBars.length; i += 1) {
      const bar = weeklyBars[i];
      if (x >= bar.x && x <= bar.x + bar.width) {
        return i;
      }
    }
    return null;
  };

  const weeklyTapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => {
      const barIndex = findBarAtPosition(event.x);
      if (barIndex !== null && weeklyBars[barIndex].value > 0) {
        setSelectedBarIndex(barIndex);
        barTooltipX.value = withSpring(
          weeklyBars[barIndex].x + weeklyBars[barIndex].width / 2 - 50,
        );
        barTooltipY.value = withSpring(weeklyBars[barIndex].y - 60);
      } else {
        setSelectedBarIndex(null);
      }
    });

  const animatedBarTooltipStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: barTooltipX.value },
      { translateY: barTooltipY.value },
    ],
  }));

  return (
    <GestureHandlerRootView
      style={[styles.container, { backgroundColor: nc.background }]}
    >
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="pump-medical" size={64} color={nc.textMuted} />
          <Text style={[styles.emptyTitle, { color: nc.textNormal }]}>
            Aucune donnée disponible
          </Text>
          <Text style={[styles.emptySubtitle, { color: nc.textLight }]}>
            Commencez à enregistrer vos sessions pour voir les statistiques
          </Text>
          <TouchableOpacity
            style={[styles.emptyCta, { backgroundColor: C.green }]}
            onPress={() => router.replace("/baby/chrono")}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un pompage"
          >
            <FontAwesome name="plus" size={14} color="#ffffff" />
            <Text style={styles.emptyCtaText}>Ajouter un pompage</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
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
                style={[
                  styles.iconBadge,
                  { backgroundColor: C.iconBadgeBg },
                ]}
              >
                <FontAwesome
                  name="pump-medical"
                  size={18}
                  color={C.green}
                />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.sectionTitle, { color: C.ink }]}>
                  Pompages du jour
                </Text>
                <Text style={[styles.sectionSubtitle, { color: C.muted }]}>
                  {currentDay.toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </Text>
              </View>
            </View>

            <View style={styles.navigationRow}>
              <TouchableOpacity
                style={[
                  styles.navButton,
                  { backgroundColor: C.navButtonBg, borderColor: C.border },
                ]}
                onPress={() => setCurrentDay(addDays(currentDay, -1))}
                accessibilityLabel="Jour précédent"
              >
                <FontAwesome
                  name="chevron-left"
                  size={14}
                  color={C.muted}
                />
                <Text style={[styles.navText, { color: C.muted }]}>
                  Préc.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.todayButton, { backgroundColor: C.green }]}
                onPress={() => setCurrentDay(startOfDay(new Date()))}
                accessibilityLabel="Revenir à aujourd'hui"
              >
                <Text style={styles.todayText}>Aujourd&apos;hui</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.navButton,
                  { backgroundColor: C.navButtonBg, borderColor: C.border },
                ]}
                onPress={() => setCurrentDay(addDays(currentDay, 1))}
                accessibilityLabel="Jour suivant"
              >
                <Text style={[styles.navText, { color: C.muted }]}>
                  Suiv.
                </Text>
                <FontAwesome
                  name="chevron-right"
                  size={14}
                  color={C.muted}
                />
              </TouchableOpacity>
            </View>

            {dailyValues.length === 0 ? (
              <View style={styles.noDataContainer}>
                <FontAwesome
                  name="info-circle"
                  size={24}
                  color={C.muted}
                />
                <Text style={[styles.noDataText, { color: C.muted }]}>
                  Aucune session ce jour
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
                      Total
                    </Text>
                    <Text
                      style={[styles.metricValue, { color: C.greenDeep }]}
                    >
                      {dailyTotal} ml
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.metricCard,
                      { backgroundColor: C.metricBg, borderColor: C.border },
                    ]}
                  >
                    <Text style={[styles.metricLabel, { color: C.muted }]}>
                      Session{dailyValues.length > 1 ? "s" : ""}
                    </Text>
                    <Text
                      style={[styles.metricValue, { color: C.greenDeep }]}
                    >
                      {dailyValues.length}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.metricCard,
                      { backgroundColor: C.metricBg, borderColor: C.border },
                    ]}
                  >
                    <Text style={[styles.metricLabel, { color: C.muted }]}>
                      Moyenne
                    </Text>
                    <Text
                      style={[styles.metricValue, { color: C.greenDeep }]}
                    >
                      {dailyAverage} ml
                    </Text>
                  </View>
                </View>

                <View style={styles.chartContainer}>
                  <View style={styles.yAxisContainer}>
                    {yAxisLabels.map((label, index) => (
                      <View
                        key={`y-label-${index}`}
                        style={[styles.yAxisLabel, { top: label.y - 8 }]}
                      >
                        <Text style={[styles.yAxisText, { color: C.muted }]}>
                          {label.value}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <GestureDetector gesture={pointGesture}>
                    <Canvas
                      style={[styles.canvas, { width: SCREEN_WIDTH + 20 }]}
                      accessibilityLabel="Graphique des pompages du jour. Touchez ou glissez pour voir les détails."
                    >
                      <RoundedRect
                        x={CHART_PADDING.left}
                        y={CHART_PADDING.top}
                        width={CHART_WIDTH}
                        height={
                          CHART_HEIGHT -
                          CHART_PADDING.top -
                          CHART_PADDING.bottom
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
                          p2={vec(
                            SCREEN_WIDTH - CHART_PADDING.right,
                            label.y,
                          )}
                          color={C.gridLine}
                          strokeWidth={1}
                        />
                      ))}

                      <Path path={fillPath}>
                        <LinearGradient
                          start={vec(0, CHART_PADDING.top)}
                          end={vec(0, CHART_HEIGHT - CHART_PADDING.bottom)}
                          colors={[
                            C.fillGradientStart,
                            C.fillGradientEnd,
                          ]}
                        />
                      </Path>

                      <Path
                        path={linePath}
                        style="stroke"
                        strokeWidth={3}
                        color={C.green}
                      >
                        <Shadow
                          dx={0}
                          dy={2}
                          blur={4}
                          color="rgba(46, 125, 50, 0.35)"
                        />
                      </Path>

                      {chartPoints.map((point, index) => {
                        const isRecord = point.value === maxDaily;
                        return (
                          <Circle
                            key={`point-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r={isRecord ? 6.5 : 4.5}
                            color={isRecord ? C.gold : C.green}
                          >
                            <Shadow
                              dx={0}
                              dy={2}
                              blur={4}
                              color={
                                isRecord
                                  ? "rgba(184, 134, 11, 0.45)"
                                  : "rgba(46, 125, 50, 0.3)"
                              }
                            />
                          </Circle>
                        );
                      })}
                    </Canvas>
                  </GestureDetector>

                  {showTapHint && dailyValues.length > 0 && (
                    <View
                      style={[
                        styles.tapHint,
                        {
                          backgroundColor: C.tooltipBg,
                          borderColor: C.tooltipBorder,
                        },
                      ]}
                    >
                      <FontAwesome
                        name="hand-pointer"
                        size={12}
                        color={C.muted}
                      />
                      <Text style={[styles.tapHintText, { color: C.muted }]}>
                        Touchez ou glissez pour les détails
                      </Text>
                    </View>
                  )}

                  {selectedPointIndex !== null && (
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
                      <View style={styles.tooltipContent}>
                        <Text
                          style={[styles.tooltipTime, { color: C.muted }]}
                        >
                          {chartPoints[selectedPointIndex].label}
                        </Text>
                        <Text
                          style={[
                            styles.tooltipValue,
                            { color: C.greenDeep },
                          ]}
                        >
                          {chartPoints[selectedPointIndex].value} ml
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.tooltipArrow,
                          { borderTopColor: C.tooltipBg },
                        ]}
                      />
                    </Animated.View>
                  )}

                  <View style={styles.xAxisContainer}>
                    {chartPoints
                      .filter(
                        (_, i) =>
                          i %
                            Math.max(
                              1,
                              Math.floor(chartPoints.length / 5),
                            ) ===
                          0,
                      )
                      .map((point, index) => (
                        <Text
                          key={`xlabel-${index}`}
                          style={[
                            styles.xAxisText,
                            { left: point.x - 22, color: C.muted },
                          ]}
                        >
                          {point.label}
                        </Text>
                      ))}
                  </View>
                </View>
              </>
            )}
          </View>

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
                style={[
                  styles.iconBadge,
                  { backgroundColor: C.iconBadgeBg },
                ]}
              >
                <FontAwesome
                  name="calendar-week"
                  size={18}
                  color={C.green}
                />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.sectionTitle, { color: C.ink }]}>
                  Semaine en cours
                </Text>
                <Text style={[styles.sectionSubtitle, { color: C.muted }]}>
                  {`${weekStart.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })} - ${new Date(weekEnd.getTime() - 1).toLocaleDateString(
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
                  { backgroundColor: C.navButtonBg, borderColor: C.border },
                ]}
                onPress={() => setCurrentWeek(addWeeks(currentWeek, -1))}
                accessibilityLabel="Semaine précédente"
              >
                <FontAwesome
                  name="chevron-left"
                  size={14}
                  color={C.muted}
                />
                <Text style={[styles.navText, { color: C.muted }]}>
                  Préc.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.todayButton, { backgroundColor: C.green }]}
                onPress={() => setCurrentWeek(getStartOfWeek(new Date()))}
                accessibilityLabel="Revenir à cette semaine"
              >
                <Text style={styles.todayText}>Cette semaine</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.navButton,
                  { backgroundColor: C.navButtonBg, borderColor: C.border },
                ]}
                onPress={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                accessibilityLabel="Semaine suivante"
              >
                <Text style={[styles.navText, { color: C.muted }]}>
                  Suiv.
                </Text>
                <FontAwesome
                  name="chevron-right"
                  size={14}
                  color={C.muted}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.metricsRow}>
              <View
                style={[
                  styles.metricCard,
                  { backgroundColor: C.metricBg, borderColor: C.border },
                ]}
              >
                <Text style={[styles.metricLabel, { color: C.muted }]}>
                  Total semaine
                </Text>
                <Text style={[styles.metricValue, { color: C.greenDeep }]}>
                  {weeklyTotal} ml
                </Text>
              </View>
              <View
                style={[
                  styles.metricCard,
                  { backgroundColor: C.metricBg, borderColor: C.border },
                ]}
              >
                <Text style={[styles.metricLabel, { color: C.muted }]}>
                  {weeklyAverageLabel}
                </Text>
                <Text style={[styles.metricValue, { color: C.greenDeep }]}>
                  {weeklyAverage} ml
                </Text>
              </View>
              {maxWeekly > 0 && (
                <View
                  style={[
                    styles.metricCard,
                    {
                      backgroundColor: C.metricHighlightBg,
                      borderColor: C.metricHighlightBorder,
                    },
                  ]}
                >
                  <Text style={[styles.metricLabel, { color: C.muted }]}>
                    Record
                  </Text>
                  <Text style={[styles.metricValue, { color: C.gold }]}>
                    {bestDay}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.chartContainer}>
              <View style={styles.yAxisContainer}>
                {weeklyYAxisLabels.map((label, index) => (
                  <View
                    key={`wy-${index}`}
                    style={[styles.yAxisLabel, { top: label.y - 8 }]}
                  >
                    <Text style={[styles.yAxisText, { color: C.muted }]}>
                      {label.value}
                    </Text>
                  </View>
                ))}
              </View>

              <GestureDetector gesture={weeklyTapGesture}>
                <Canvas
                  style={styles.canvas}
                  accessibilityLabel="Graphique hebdomadaire des pompages. Appuyez sur une barre pour voir les détails."
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

                  {weeklyYAxisLabels.map((label, index) => (
                    <SkiaLine
                      key={`wgrid-${index}`}
                      p1={vec(CHART_PADDING.left, label.y)}
                      p2={vec(SCREEN_WIDTH - CHART_PADDING.right, label.y)}
                      color={C.gridLine}
                      strokeWidth={1}
                    />
                  ))}

                  {weeklyBars.map((bar, index) => (
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
                          color="rgba(184, 134, 11, 0.4)"
                        />
                      )}
                    </RoundedRect>
                  ))}
                </Canvas>
              </GestureDetector>

              {selectedBarIndex !== null && (
                <Animated.View
                  style={[
                    styles.barTooltip,
                    animatedBarTooltipStyle,
                    {
                      backgroundColor: C.tooltipBg,
                      borderColor: C.tooltipBorder,
                    },
                  ]}
                >
                  <Text style={[styles.tooltipTime, { color: C.muted }]}>
                    {weeklyBars[selectedBarIndex].jour}
                  </Text>
                  <Text
                    style={[styles.tooltipValue, { color: C.greenDeep }]}
                  >
                    {weeklyBars[selectedBarIndex].value} ml
                  </Text>
                </Animated.View>
              )}

              <View style={styles.xAxisContainer}>
                {jours.map((jour, index) => (
                  <Text
                    key={`wx-${index}`}
                    style={[
                      styles.xAxisText,
                      {
                        left: weeklyBars[index].x - weeklyBarSpacing / 2,
                        width: weeklyBarWidth + weeklyBarSpacing,
                        color: C.muted,
                      },
                    ]}
                  >
                    {jour}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        </>
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
    textTransform: "capitalize",
  },
  navigationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 12,
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
  noDataContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  noDataText: {
    fontSize: 16,
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
    fontSize: 10,
    fontWeight: "600",
    width: 44,
    textAlign: "center",
    bottom: 6,
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
    borderWidth: 1,
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
    fontWeight: "600",
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
  barTooltip: {
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
});
