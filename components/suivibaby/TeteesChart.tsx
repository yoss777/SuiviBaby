import FontAwesome from "@expo/vector-icons/FontAwesome6";
import {
  Canvas,
  Group,
  LinearGradient,
  RoundedRect,
  Shadow,
  Line as SkiaLine,
  vec,
} from "@shopify/react-native-skia";
import { Timestamp } from "firebase/firestore";
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
  tetees: any[];
};

const SCREEN_WIDTH = Dimensions.get("window").width - 40;
const CHART_HEIGHT = 210;
const CHART_PADDING = { top: 18, right: 18, bottom: 46, left: 50 };
const CHART_WIDTH = SCREEN_WIDTH - CHART_PADDING.left - CHART_PADDING.right;

const COLORS = {
  surface: "#ffffff",
  ink: "#1e2a36",
  muted: "#6a7784",
  border: "#e5ecf2",
  blue: "#2f80ed",
  blueDeep: "#1b4f9c",
  cyan: "#2bb3a3",
  green: "#2e7d32",
  gold: "#f5b700",
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

export default function TeteesChart({ tetees }: Props) {
  const [viewMode, setViewMode] = useState<"quantity" | "frequency">(
    "frequency",
  );
  const [typeFilter, setTypeFilter] = useState<"tous" | "seins" | "biberons">(
    "tous",
  );
  const [currentWeek, setCurrentWeek] = useState<Date>(
    getStartOfWeek(new Date()),
  );
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [isGroupedView, setIsGroupedView] = useState(false);

  const tooltipX = useSharedValue(0);
  const tooltipY = useSharedValue(0);

  const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  useEffect(() => {
    if (typeFilter === "seins") {
      setViewMode("frequency");
    }
  }, [typeFilter]);

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
    return false;
  });

  const weeklyData: Record<
    string,
    {
      quantity: number;
      count: number;
      seinsCount: number;
      biberonsCount: number;
      biberonsQuantity: number;
    }
  > = {
    Lun: {
      quantity: 0,
      count: 0,
      seinsCount: 0,
      biberonsCount: 0,
      biberonsQuantity: 0,
    },
    Mar: {
      quantity: 0,
      count: 0,
      seinsCount: 0,
      biberonsCount: 0,
      biberonsQuantity: 0,
    },
    Mer: {
      quantity: 0,
      count: 0,
      seinsCount: 0,
      biberonsCount: 0,
      biberonsQuantity: 0,
    },
    Jeu: {
      quantity: 0,
      count: 0,
      seinsCount: 0,
      biberonsCount: 0,
      biberonsQuantity: 0,
    },
    Ven: {
      quantity: 0,
      count: 0,
      seinsCount: 0,
      biberonsCount: 0,
      biberonsQuantity: 0,
    },
    Sam: {
      quantity: 0,
      count: 0,
      seinsCount: 0,
      biberonsCount: 0,
      biberonsQuantity: 0,
    },
    Dim: {
      quantity: 0,
      count: 0,
      seinsCount: 0,
      biberonsCount: 0,
      biberonsQuantity: 0,
    },
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
  const totalCountLabel =
    typeFilter === "tous"
      ? "Repas"
      : typeFilter === "biberons"
        ? "Biberon"
        : "Tétée";
  const frequencyUnit =
    typeFilter === "tous"
      ? "repas"
      : typeFilter === "biberons"
        ? "biberons"
        : "tétées";
  const recordLabel =
    typeFilter === "tous"
      ? "Record: repas"
      : typeFilter === "biberons"
        ? "Record: biberon"
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
  const groupedMax = Math.max(maxSeinsCount, maxBiberonsCount, 0);
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
        const biberonsHeight =
          currentMax > 0 ? (biberons / currentMax) * chartAreaHeight : 0;
        const seinsHeight =
          currentMax > 0 ? (seins / currentMax) * chartAreaHeight : 0;
        const baseY = CHART_PADDING.top + chartAreaHeight;
        const topY = baseY - Math.max(biberonsHeight, seinsHeight, 2);

        return {
          jour,
          value: total,
          x,
          width: barWidth,
          y: topY,
          height: Math.max(Math.max(biberonsHeight, seinsHeight), 2),
          isMax: total === maxCount && total > 0,
          segments: {
            biberonsHeight,
            seinsHeight,
          },
        };
      }

      if (isStacked) {
        const total = countValues[index];
        const seins = weeklyData[jour].seinsCount;
        const biberons = weeklyData[jour].biberonsCount;
        const totalParts = seins + biberons;
        const barHeight =
          currentMax > 0 ? (total / currentMax) * chartAreaHeight : 0;
        const biberonsHeight =
          totalParts > 0 ? (biberons / totalParts) * barHeight : 0;
        const seinsHeight =
          totalParts > 0 ? (seins / totalParts) * barHeight : 0;
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
          },
        };
      }

      const barHeight =
        currentMax > 0 ? (value / currentMax) * chartAreaHeight : 0;
      const y = CHART_PADDING.top + (chartAreaHeight - barHeight);

      let color = COLORS.blue;
      if (value === 0) {
        color = "#eef2f7";
      } else if (typeFilter === "seins") {
        color = COLORS.green;
      } else if (typeFilter === "biberons") {
        color = COLORS.cyan;
      } else if (value === currentMax && value > 0) {
        color = COLORS.gold;
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
    <GestureHandlerRootView style={styles.container}>
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="baby" size={64} color="#e9ecef" />
          <Text style={styles.emptyTitle}>Aucune donnée disponible</Text>
          <Text style={styles.emptySubtitle}>
            Commencez à enregistrer des tétées pour voir les statistiques
          </Text>
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBadge}>
              <FontAwesome name="baby" size={18} color={COLORS.blue} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.sectionTitle}>Statistiques des tétées</Text>
              <Text style={styles.sectionSubtitle}>
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
              style={styles.navButton}
              onPress={() => setCurrentWeek(addWeeks(currentWeek, -1))}
            >
              <FontAwesome name="chevron-left" size={14} color={COLORS.muted} />
              <Text style={styles.navText}>Préc.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.todayButton}
              onPress={() => setCurrentWeek(getStartOfWeek(new Date()))}
            >
              <Text style={styles.todayText}>Cette semaine</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navButton}
              onPress={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            >
              <Text style={styles.navText}>Suiv.</Text>
              <FontAwesome
                name="chevron-right"
                size={14}
                color={COLORS.muted}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.typeFilterContainer}>
            {[
              { key: "tous", label: "Tous", icon: "baby" },
              { key: "seins", label: "Tétées", icon: "person-breastfeeding" },
              { key: "biberons", label: "Biberons", icon: "jar-wheat" },
            ].map((type) => {
              const isActive = typeFilter === type.key;
              const activeColor = COLORS.blue;
              return (
                <TouchableOpacity
                  key={type.key}
                  style={[
                    styles.typeFilterButton,
                    isActive && styles.typeFilterButtonActive,
                    isActive && styles.typeFilterButtonActive,
                  ]}
                  onPress={() => setTypeFilter(type.key as typeof typeFilter)}
                >
                  <FontAwesome
                    name={type.icon}
                    size={14}
                    color={isActive ? activeColor : COLORS.muted}
                  />
                  <Text
                    style={[
                      styles.typeFilterText,
                      isActive && styles.typeFilterTextActive,
                      isActive && { color: activeColor },
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.toggleContainer}>
            {typeFilter !== "seins" && (
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  viewMode === "quantity" && styles.toggleButtonActive,
                ]}
                onPress={() => setViewMode("quantity")}
              >
                <FontAwesome
                  name="droplet"
                  size={14}
                  color={viewMode === "quantity" ? COLORS.blue : COLORS.muted}
                />
                <Text
                  style={[
                    styles.toggleText,
                    viewMode === "quantity" && styles.toggleTextActive,
                  ]}
                >
                  Quantité
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.toggleButton,
                viewMode === "frequency" && styles.toggleButtonActive,
              ]}
              onPress={() => setViewMode("frequency")}
            >
              <FontAwesome
                name="clock"
                size={14}
                color={viewMode === "frequency" ? COLORS.blue : COLORS.muted}
              />
              <Text
                style={[
                  styles.toggleText,
                  viewMode === "frequency" && styles.toggleTextActive,
                ]}
              >
                Fréquence
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>
                {totalCountLabel}
                {totalCountLabel !== "Repas" && totalWeekCount > 1 ? "s" : ""}
              </Text>
              <Text style={styles.metricValue}>{totalWeekCount}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>{countAverageLabel}</Text>
              <Text style={styles.metricValue}>{dailyAverageCount}</Text>
            </View>
            {viewMode === "quantity" && typeFilter !== "seins" && (
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Total lait</Text>
                <Text style={styles.metricValue}>{totalWeekQuantity} ml</Text>
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
                      { backgroundColor: COLORS.green },
                    ]}
                  />
                  <Text style={styles.legendLabel}>Tétées</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendSwatch,
                      { backgroundColor: COLORS.cyan },
                    ]}
                  />
                  <Text style={styles.legendLabel}>Biberons</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.groupToggle,
                  isGrouped && styles.groupToggleActive,
                ]}
                onPress={() => setIsGroupedView((prev) => !prev)}
              >
                <Text
                  style={[
                    styles.groupToggleText,
                    isGrouped && styles.groupToggleTextActive,
                  ]}
                >
                  Vue groupée
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.chartContainer}>
            <View style={styles.yAxisContainer}>
              {yAxisLabels.map((label, index) => (
                <View
                  key={index}
                  style={[styles.yAxisLabel, { top: label.y - 8 }]}
                >
                  <Text style={styles.yAxisText}>{label.value}</Text>
                </View>
              ))}
            </View>

            <GestureDetector gesture={tapGesture}>
              <Canvas style={styles.canvas}>
                <RoundedRect
                  x={CHART_PADDING.left}
                  y={CHART_PADDING.top}
                  width={CHART_WIDTH}
                  height={
                    CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
                  }
                  r={12}
                  color={COLORS.surface}
                >
                  <LinearGradient
                    start={vec(CHART_PADDING.left, CHART_PADDING.top)}
                    end={vec(
                      CHART_PADDING.left,
                      CHART_HEIGHT - CHART_PADDING.bottom,
                    )}
                    colors={["#f5f9ff", "#ffffff"]}
                  />
                </RoundedRect>

                {yAxisLabels.map((label, index) => (
                  <SkiaLine
                    key={`grid-${index}`}
                    p1={vec(CHART_PADDING.left, label.y)}
                    p2={vec(SCREEN_WIDTH - CHART_PADDING.right, label.y)}
                    color="rgba(30, 60, 90, 0.08)"
                    strokeWidth={1}
                  />
                ))}

                {bars.map((bar, index) => {
                  if (isGrouped && bar.segments) {
                    const baseY = CHART_PADDING.top + chartAreaHeight;
                    const biberonsHeight = bar.segments.biberonsHeight;
                    const seinsHeight = bar.segments.seinsHeight;
                    const groupGap = 4;
                    const subWidth = Math.max((bar.width - groupGap) / 2, 2);
                    const seinsX = bar.x;
                    const biberonsX = bar.x + subWidth + groupGap;
                    const seinsY = baseY - seinsHeight;
                    const biberonsY = baseY - biberonsHeight;
                    return (
                      <Group key={`bar-${index}`}>
                        {seinsHeight > 0 && (
                          <RoundedRect
                            x={seinsX}
                            y={seinsY}
                            width={subWidth}
                            height={Math.max(seinsHeight, 2)}
                            r={6}
                            color={COLORS.green}
                          />
                        )}
                        {biberonsHeight > 0 && (
                          <RoundedRect
                            x={biberonsX}
                            y={biberonsY}
                            width={subWidth}
                            height={Math.max(biberonsHeight, 2)}
                            r={6}
                            color={COLORS.cyan}
                          >
                            {bar.isMax && (
                              <Shadow
                                dx={0}
                                dy={2}
                                blur={6}
                                color="rgba(245, 183, 0, 0.35)"
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
                    const seinsHeight = bar.segments.seinsHeight;
                    const biberonsY = baseY - biberonsHeight;
                    const seinsY = baseY - biberonsHeight - seinsHeight;
                    return (
                      <Group key={`bar-${index}`}>
                        {biberonsHeight > 0 && (
                          <RoundedRect
                            x={bar.x}
                            y={biberonsY}
                            width={bar.width}
                            height={Math.max(biberonsHeight, 2)}
                            r={6}
                            color={COLORS.cyan}
                          />
                        )}
                        {seinsHeight > 0 && (
                          <RoundedRect
                            x={bar.x}
                            y={seinsY}
                            width={bar.width}
                            height={Math.max(seinsHeight, 2)}
                            r={6}
                            color={COLORS.green}
                          >
                            {bar.isMax && (
                              <Shadow
                                dx={0}
                                dy={2}
                                blur={6}
                                color="rgba(245, 183, 0, 0.35)"
                              />
                            )}
                          </RoundedRect>
                        )}
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
                          color="rgba(245, 183, 0, 0.35)"
                        />
                      )}
                    </RoundedRect>
                  );
                })}
              </Canvas>
            </GestureDetector>

            {selectedBarIndex !== null && (
              <Animated.View style={[styles.tooltip, animatedTooltipStyle]}>
                <Text style={styles.tooltipDay}>
                  {bars[selectedBarIndex].jour}
                </Text>
                <Text style={styles.tooltipValue}>
                  {bars[selectedBarIndex].value}{" "}
                  {viewMode === "quantity" ? "ml" : frequencyUnit}
                </Text>
                {typeFilter === "tous" && viewMode === "frequency" && (
                  <Text style={styles.tooltipDetail}>
                    {weeklyData[bars[selectedBarIndex].jour].seinsCount} tétée
                    {weeklyData[bars[selectedBarIndex].jour].seinsCount > 1
                      ? "s"
                      : ""}
                    {"\n"}
                    {weeklyData[bars[selectedBarIndex].jour].biberonsCount}{" "}
                    biberon
                    {weeklyData[bars[selectedBarIndex].jour].biberonsCount > 1
                      ? "s"
                      : ""}
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
                    { left: bars[index].x + bars[index].width / 2 - 15 },
                  ]}
                >
                  {jour}
                </Text>
              ))}
            </View>
          </View>

          {typeFilter === "tous" ? (
            <View style={styles.statsContainer}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{totalWeekCount}</Text>
                  <Text style={styles.statLabel}>
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
                    color={COLORS.green}
                  />
                  <Text style={[styles.statValue, { color: COLORS.green }]}>
                    {totalSeinsCount}
                  </Text>
                  <Text style={styles.statLabel}>
                    Tétée{totalSeinsCount > 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <FontAwesome name="jar-wheat" size={14} color={COLORS.cyan} />
                  <Text style={[styles.statValue, { color: COLORS.cyan }]}>
                    {totalBiberonsCount}
                  </Text>
                  <Text style={styles.statLabel}>
                    Biberon{totalBiberonsCount > 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{totalWeekQuantity} ml</Text>
                  <Text style={styles.statLabel}>Total lait</Text>
                </View>
              </View>
            </View>
          ) : viewMode === "quantity" ? (
            <View style={styles.statsContainer}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: COLORS.cyan }]}>
                    {totalWeekQuantity} ml
                  </Text>
                  <Text style={styles.statLabel}>Total semaine</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: COLORS.cyan }]}>
                    {dailyAverageQuantity} ml
                  </Text>
                  <Text style={styles.statLabel}>{quantityAverageLabel}</Text>
                </View>
                {maxQuantity > 0 && (
                  <View style={styles.statItem}>
                    <FontAwesome name="trophy" size={16} color={COLORS.gold} />
                    <Text style={[styles.statValue, { color: COLORS.gold }]}>
                      {bestQuantityDay}
                    </Text>
                    <Text style={styles.statLabel}>
                      Record: {maxQuantity} ml
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.statsContainer}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text
                    style={[
                      styles.statValue,
                      typeFilter === "seins"
                        ? { color: COLORS.green }
                        : { color: COLORS.cyan },
                    ]}
                  >
                    {totalWeekCount}
                  </Text>
                  <Text style={styles.statLabel}>
                    {totalCountLabel}
                    {totalWeekCount > 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text
                    style={[
                      styles.statValue,
                      typeFilter === "seins"
                        ? { color: COLORS.green }
                        : { color: COLORS.cyan },
                    ]}
                  >
                    {dailyAverageCount}
                  </Text>
                  <Text style={styles.statLabel}>{countAverageLabel}</Text>
                </View>
                {maxCount > 0 && (
                  <View style={styles.statItem}>
                    <FontAwesome name="trophy" size={16} color={COLORS.gold} />
                    <Text style={[styles.statValue, { color: COLORS.gold }]}>
                      {bestCountDay}
                    </Text>
                    <Text style={styles.statLabel}>
                      {recordLabel}
                      {maxCount > 1 ? "s" : ""} {maxCount}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {totalWeekCount > 0 && (
            <View style={styles.insightContainer}>
              <FontAwesome name="lightbulb" size={16} color={COLORS.cyan} />
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>
                  {typeFilter === "tous"
                    ? "Aperçu global de la semaine"
                    : `Aperçu ${typeFilter} de la semaine`}
                </Text>
                <Text style={styles.insightText}>
                  {typeFilter === "tous"
                    ? `Cette semaine: ${totalSeinsCount} tétée${totalSeinsCount > 1 ? "s" : ""} au sein, ${totalBiberonsCount} biberon${totalBiberonsCount > 1 ? "s" : ""} (${totalWeekQuantity} ml au total). ${
                        totalSeinsCount > totalBiberonsCount
                          ? "L'allaitement domine cette semaine."
                          : totalBiberonsCount > totalSeinsCount
                            ? "Les biberons dominent cette semaine."
                            : "Équilibre entre seins et biberons."
                      }`
                    : typeFilter === "seins"
                      ? `${totalSeinsCount} tétée${totalSeinsCount > 1 ? "s" : ""} cette semaine, soit ${dailyAverageCount} par jour en moyenne. ${
                          maxCount > dailyAverageCount * 1.5
                            ? `Le ${bestCountDay} a été particulièrement actif.`
                            : "Rythme régulier cette semaine."
                        }`
                      : `${totalWeekQuantity} ml de lait en biberon cette semaine (${totalBiberonsCount} biberon${totalBiberonsCount > 1 ? "s au total" : ""}). Moyenne de ${dailyAverageQuantity} ml par jour.`}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
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
    color: "#495057",
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#6c757d",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  section: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 6,
    borderRadius: 18,
    padding: 18,
    shadowColor: "#000",
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
    backgroundColor: "#eaf1ff",
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
    color: COLORS.ink,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
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
    backgroundColor: "#f2f6ff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  navText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: "600",
  },
  todayButton: {
    backgroundColor: COLORS.blue,
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
    backgroundColor: "#f5f6f8",
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    gap: 6,
  },
  typeFilterButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
  },
  typeFilterButtonActive: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: COLORS.blue,
  },
  typeFilterText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: "600",
  },
  typeFilterTextActive: {
    color: COLORS.ink,
    fontWeight: "700",
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#f5f6f8",
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
  },
  toggleButtonActive: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: COLORS.blue,
  },
  toggleText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: "600",
  },
  toggleTextActive: {
    color: COLORS.blue,
    fontWeight: "700",
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
    color: COLORS.muted,
    fontWeight: "600",
  },
  groupToggle: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#f7f9fc",
  },
  groupToggleActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  groupToggleText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: "600",
  },
  groupToggleTextActive: {
    color: "white",
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#f7f9fc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricLabel: {
    fontSize: 11,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.blueDeep,
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
    color: COLORS.muted,
    fontWeight: "600",
  },
  canvas: {
    width: SCREEN_WIDTH,
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
    color: COLORS.muted,
    fontWeight: "600",
    width: 30,
    textAlign: "center",
    bottom: 8,
  },
  tooltip: {
    position: "absolute",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.muted,
    fontWeight: "600",
  },
  tooltipValue: {
    fontSize: 15,
    color: COLORS.blueDeep,
    fontWeight: "700",
    marginTop: 2,
  },
  tooltipDetail: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
  statsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
    color: COLORS.blueDeep,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: "center",
  },
  insightContainer: {
    flexDirection: "row",
    backgroundColor: "#eaf5fb",
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
    color: COLORS.blueDeep,
    marginBottom: 4,
  },
  insightText: {
    fontSize: 13,
    color: "#2f4c66",
    lineHeight: 18,
  },
});
