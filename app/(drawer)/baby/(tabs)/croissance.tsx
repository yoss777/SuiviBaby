import { ThemedView } from "@/components/themed-view";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterCroissance,
  modifierCroissance,
  supprimerCroissance,
} from "@/migration/eventsDoubleWriteService";
import { ecouterCroissancesHybrid } from "@/migration/eventsHybridService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
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

function toDate(value: any): Date {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

export default function CroissanceScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { openSheet, closeSheet, viewProps } = useSheet();
  const headerOwnerId = useRef(
    `croissance-${Math.random().toString(36).slice(2)}`,
  );

  const [entries, setEntries] = useState<CroissanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CroissanceEntry | null>(
    null,
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [tailleCm, setTailleCm] = useState("");
  const [poidsKg, setPoidsKg] = useState("");
  const [teteCm, setTeteCm] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("poids");
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  );
  const [chartScrollX, setChartScrollX] = useState(0);
  const chartScrollRef = useRef<ScrollView | null>(null);

  const sheetOwnerId = "croissance";
  const isSheetActive = viewProps?.ownerId === sheetOwnerId;

  const resetForm = useCallback(() => {
    setDateHeure(new Date());
    setTailleCm("");
    setPoidsKg("");
    setTeteCm("");
    setIsSubmitting(false);
  }, []);

  const openAddModal = useCallback(() => {
    setEditingEntry(null);
    resetForm();
    openSheet(buildSheetProps());
  }, [openSheet, resetForm]);

  const openEditModal = useCallback(
    (entry: CroissanceEntry) => {
      setEditingEntry(entry);
      setDateHeure(toDate(entry.date));
      setTailleCm(entry.tailleCm?.toString() ?? "");
      setPoidsKg(entry.poidsKg?.toString() ?? "");
      setTeteCm(entry.teteCm?.toString() ?? "");
      setIsSubmitting(false);
      openSheet(buildSheetProps());
    },
    [openSheet],
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
  }, [activeChild?.id]);

  useEffect(() => {
    setSelectedPointIndex(null);
  }, [metric, entries]);

  useEffect(() => {
    if (!isSheetActive) return;
    openSheet(buildSheetProps());
  }, [
    isSheetActive,
    openSheet,
    editingEntry,
    isSubmitting,
    dateHeure,
    tailleCm,
    poidsKg,
    teteCm,
    showDate,
    showTime,
  ]);

  const parseNumber = (value: string) => {
    const normalized = value.replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const handleSubmit = async () => {
    if (isSubmitting || !activeChild) return;

    const tailleValue = parseNumber(tailleCm);
    const poidsValue = parseNumber(poidsKg);
    const teteValue = parseNumber(teteCm);

    if (!tailleValue && !poidsValue && !teteValue) {
      Alert.alert("Attention", "Entrez au moins une mesure.");
      return;
    }

    try {
      setIsSubmitting(true);
      const dataToSave = {
        tailleCm: tailleValue,
        poidsKg: poidsValue,
        teteCm: teteValue,
        date: dateHeure,
      };

      if (editingEntry) {
        await modifierCroissance(activeChild.id, editingEntry.id, dataToSave);
      } else {
        await ajouterCroissance(activeChild.id, dataToSave);
      }
      closeSheet();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      Alert.alert("Erreur", "Impossible de sauvegarder la croissance.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editingEntry || !activeChild) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!editingEntry || !activeChild) return;
    try {
      setIsSubmitting(true);
      await supprimerCroissance(activeChild.id, editingEntry.id);
      setShowDeleteModal(false);
      closeSheet();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      Alert.alert("Erreur", "Impossible de supprimer la mesure.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onChangeDate = (_event: any, selectedDate?: Date) => {
    setShowDate(false);
    if (selectedDate) {
      setDateHeure((prev) => {
        const newDate = new Date(prev);
        newDate.setFullYear(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
        );
        return newDate;
      });
    }
  };

  const onChangeTime = (_event: any, selectedDate?: Date) => {
    setShowTime(false);
    if (selectedDate) {
      setDateHeure((prev) => {
        const newDate = new Date(prev);
        newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
        return newDate;
      });
    }
  };

  function renderSheetContent() {
    return (
      <>
        <Text style={styles.modalLabel}>Taille (cm)</Text>
        <TextInput
          value={tailleCm}
          onChangeText={setTailleCm}
          placeholder="ex: 62.5"
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <Text style={styles.modalLabel}>Poids (kg)</Text>
        <TextInput
          value={poidsKg}
          onChangeText={setPoidsKg}
          placeholder="ex: 5.8"
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <Text style={styles.modalLabel}>Tour de tête (cm)</Text>
        <TextInput
          value={teteCm}
          onChangeText={setTeteCm}
          placeholder="ex: 41"
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <Text style={styles.modalLabel}>Date & heure</Text>
        <View style={styles.dateRow}>
          <Pressable
            style={[styles.dateButton, isSubmitting && styles.buttonDisabled]}
            onPress={() => setShowDate(true)}
            disabled={isSubmitting}
          >
            <FontAwesome name="calendar" size={14} color={colors.tint} />
            <Text style={styles.dateButtonText}>Date</Text>
          </Pressable>
          <Pressable
            style={[styles.dateButton, isSubmitting && styles.buttonDisabled]}
            onPress={() => setShowTime(true)}
            disabled={isSubmitting}
          >
            <FontAwesome name="clock" size={14} color={colors.tint} />
            <Text style={styles.dateButtonText}>Heure</Text>
          </Pressable>
        </View>

        <View style={styles.selectedDateRow}>
          <Text style={styles.selectedDateText}>
            {dateHeure.toLocaleDateString("fr-FR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <Text style={styles.selectedTimeText}>
            {dateHeure.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {showDate && (
          <DateTimePicker
            value={dateHeure}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeDate}
          />
        )}
        {showTime && (
          <DateTimePicker
            value={dateHeure}
            mode="time"
            is24Hour={true}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeTime}
          />
        )}
      </>
    );
  }

  function buildSheetProps() {
    return {
      ownerId: sheetOwnerId,
      title: editingEntry ? "Modifier la croissance" : "Nouvelle mesure",
      icon: "seedling",
      accentColor: "#8BCF9B",
      isEditing: !!editingEntry,
      isSubmitting,
      onSubmit: handleSubmit,
      onDelete: editingEntry ? handleDelete : undefined,
      children: renderSheetContent(),
      onDismiss: () => {
        setIsSubmitting(false);
        setEditingEntry(null);
      },
    };
  }

  const renderItem = ({ item }: { item: CroissanceEntry }) => {
    const date = toDate(item.date);
    return (
      <View style={styles.itemRow}>
        <View style={styles.timelineColumn}>
          <View style={[styles.dot, { backgroundColor: "#8BCF9B" }]} />
          <View
            style={[
              styles.line,
              { backgroundColor: `${colors.tabIconDefault}30` },
            ]}
          />
        </View>
        <View style={styles.timeColumn}>
          <Text style={[styles.timeText, { color: colors.tabIconDefault }]}>
            {date.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <Text style={[styles.dateText, { color: colors.tabIconDefault }]}>
            {date.toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </Text>
        </View>
        <Pressable
          onLongPress={() => openEditModal(item)}
          delayLongPress={250}
          style={({ pressed }) => [
            styles.card,
            {
              borderColor: `${colors.tabIconDefault}30`,
              backgroundColor: colors.background,
            },
            pressed && { opacity: 0.9 },
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <FontAwesome name="seedling" size={14} color="#8BCF9B" />
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Croissance
              </Text>
            </View>
            <FontAwesome
              name="pen-to-square"
              size={12}
              color={colors.tabIconDefault}
            />
          </View>
          <View style={styles.metricsRow}>
            {item.tailleCm ? (
              <View style={[styles.metricPill, styles.metricPillTaille]}>
                <View style={styles.metricHeader}>
                  <FontAwesome
                    name="ruler-vertical"
                    size={12}
                    color="#4A90E2"
                  />
                  <Text style={[styles.metricLabel, { color: colors.text }]}>
                    Taille
                  </Text>
                </View>
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {item.tailleCm} cm
                </Text>
              </View>
            ) : null}
            {item.poidsKg ? (
              <View style={[styles.metricPill, styles.metricPillPoids]}>
                <View style={styles.metricHeader}>
                  <FontAwesome name="weight-scale" size={12} color="#6f42c1" />
                  <Text style={[styles.metricLabel, { color: colors.text }]}>
                    Poids
                  </Text>
                </View>
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {item.poidsKg} kg
                </Text>
              </View>
            ) : null}
            {item.teteCm ? (
              <View style={[styles.metricPill, styles.metricPillTete]}>
                <View style={styles.metricHeader}>
                  <MaterialCommunityIcons
                    name="baby-face-outline"
                    size={12}
                    color="#FF9800"
                  />
                  <Text style={[styles.metricLabel, { color: colors.text }]}>
                    Tête
                  </Text>
                </View>
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {item.teteCm} cm
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>
    );
  };

  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - 64;
  const metricConfig: Record<
    MetricKey,
    { label: string; color: string; rgb: string; unit: string }
  > = {
    poids: {
      label: "Poids",
      color: "#6f42c1",
      rgb: "111, 66, 193",
      unit: "kg",
    },
    taille: {
      label: "Taille",
      color: "#4A90E2",
      rgb: "74, 144, 226",
      unit: "cm",
    },
    tete: { label: "Tête", color: "#FF9800", rgb: "255, 152, 0", unit: "cm" },
  };

  const chartData = useCallback(() => {
    const entriesForMetric = entries
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

    const labels = entriesForMetric.map((entry) =>
      entry.date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      }),
    );
    const labelsFull = entriesForMetric.map((entry) =>
      entry.date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    );
    const values = entriesForMetric.map((entry) => entry.value as number);

    return {
      labels,
      labelsFull,
      values,
      hasData: values.length > 0,
    };
  }, [entries, metric]);

  const { labels, labelsFull, values, hasData } = chartData();
  const metricStyle = metricConfig[metric];

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <View style={styles.container}>
          <Text style={[styles.title, { color: colors.text }]}>Croissance</Text>
          <Text style={[styles.subtitle, { color: colors.tabIconDefault }]}>
            Taille, poids et tour de tête
          </Text>

          {loading ? (
            <View style={styles.fullScreenLoading}>
              <IconPulseDots color={colors.tint} />
              {/* <Text
                style={[styles.loadingText, { color: colors.tabIconDefault }]}
              >
                Chargement des mesures...
              </Text> */}
            </View>
          ) : (
            <View style={styles.body}>
              <View
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: colors.background,
                    borderColor: `${colors.tabIconDefault}30`,
                  },
                ]}
                onLayout={(event) => {
                  const width = event.nativeEvent.layout.width - 24;
                  if (width > 0 && Math.abs(width - chartWidth) > 1) {
                    setChartWidth(width);
                  }
                }}
              >
                <View style={styles.metricTabs}>
                  {(["poids", "taille", "tete"] as MetricKey[]).map((key) => (
                    <Pressable
                      key={key}
                      style={[
                        styles.metricTab,
                        metric === key && styles.metricTabActive,
                      ]}
                      onPress={() => setMetric(key)}
                    >
                      <Text
                        style={[
                          styles.metricTabText,
                          metric === key && styles.metricTabTextActive,
                        ]}
                      >
                        {metricConfig[key].label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {!hasData ? (
                  <View style={styles.chartEmpty}>
                    <Text
                      style={[
                        styles.emptyText,
                        { color: colors.tabIconDefault },
                      ]}
                    >
                      Ajoute une mesure pour voir la courbe.
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    ref={chartScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    onScroll={(event) => {
                      const offsetX = event.nativeEvent.contentOffset.x;
                      setChartScrollX((prev) =>
                        Math.abs(prev - offsetX) > 1 ? offsetX : prev,
                      );
                    }}
                    scrollEventThrottle={16}
                  >
                    {(() => {
                      const plotWidth = Math.max(chartWidth, labels.length * 40);
                      return (
                    <LineChart
                      data={{
                        labels:
                          labels.length > 6
                            ? labels.map((label, index) =>
                                index % 2 === 0 ? label : "",
                              )
                            : labels,
                        datasets: [{ data: values }],
                      }}
                      width={plotWidth}
                      height={220}
                      fromZero
                      yAxisSuffix={` ${metricStyle.unit}`}
                      chartConfig={{
                        backgroundColor: colors.background,
                        backgroundGradientFrom: colors.background,
                        backgroundGradientTo: colors.background,
                        decimalPlaces: 1,
                        color: (opacity = 1) =>
                          `rgba(${metricStyle.rgb}, ${opacity})`,
                        labelColor: (opacity = 1) =>
                          `rgba(0, 0, 0, ${opacity})`,
                        strokeWidth: 2,
                        fillShadowGradient: metricStyle.color,
                        fillShadowGradientOpacity: 0.15,
                      }}
                      bezier
                      style={styles.chart}
                      withDots
                      withShadow={false}
                      onDataPointClick={(data) => {
                        setSelectedPointIndex((prev) =>
                          prev === data.index ? null : data.index,
                        );
                        if (plotWidth > chartWidth) {
                          const target = Math.min(
                            Math.max(data.x - chartWidth / 2, 0),
                            plotWidth - chartWidth,
                          );
                          chartScrollRef.current?.scrollTo({
                            x: target,
                            animated: true,
                          });
                        }
                      }}
                      renderDotContent={({ x, y, index }) => {
                        if (index !== selectedPointIndex) return null;
                        const label = labelsFull[index] ?? "";
                        const value = values[index];
                        const tooltipWidth = 140;
                        const leftLimit = chartScrollX + 6;
                        const rightLimit =
                          chartScrollX + chartWidth - tooltipWidth - 6;
                        const tooltipLeft = Math.min(
                          Math.max(x - tooltipWidth / 2, leftLimit),
                          rightLimit,
                        );
                        const tooltipTop =
                          y < 24
                            ? Math.min(y + 12, 220 - 32)
                            : Math.max(y - 36, 6);
                        return (
                          <View
                            key={`tooltip-${index}`}
                            pointerEvents="none"
                            style={[
                              styles.dotTooltip,
                              {
                                left: tooltipLeft,
                                top: tooltipTop,
                                width: tooltipWidth,
                                borderColor: metricStyle.color,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.dotTooltipText,
                                { color: colors.text },
                              ]}
                            >
                              {label} · {value} {metricStyle.unit}
                            </Text>
                          </View>
                        );
                      }}
                    />
                      );
                    })()}
                  </ScrollView>
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
                    <Text
                      style={[
                        styles.emptyText,
                        { color: colors.tabIconDefault },
                      ]}
                    >
                      Aucune mesure pour le moment.
                    </Text>
                  </View>
                }
              />
            </View>
          )}
        </View>
      </SafeAreaView>

      <ConfirmModal
        visible={showDeleteModal}
        title="Supprimer la mesure"
        message="Cette mesure de croissance sera supprimée définitivement."
        confirmText="Supprimer"
        cancelText="Annuler"
        backgroundColor={colors.background}
        textColor={colors.text}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteModal(false)}
        destructive
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    marginBottom: 16,
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
  loading: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  timelineColumn: {
    width: 20,
    alignItems: "center",
  },
  timeColumn: {
    width: 68,
    paddingTop: 4,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
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
  chartCard: {
    borderRadius: 16,
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
  },
  metricTabActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  metricTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6c757d",
  },
  metricTabTextActive: {
    color: "#212529",
  },
  chart: {
    borderRadius: 12,
  },
  chartEmpty: {
    alignItems: "center",
    paddingVertical: 16,
  },
  dotTooltip: {
    position: "absolute",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    alignItems: "center",
  },
  dotTooltipText: {
    fontSize: 10,
    fontWeight: "600",
  },
  fullScreenLoading: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingVertical: 32,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    // width: "50%",
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
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "600",
  },
  metricPill: {
    // flexBasis: "33.333%",
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    // maxWidth: "100%",
    // flexShrink: 0,
  },
  metricPillTaille: {
    backgroundColor: "#4A90E212",
    borderColor: "#4A90E220",
  },
  metricPillPoids: {
    backgroundColor: "#6f42c112",
    borderColor: "#6f42c120",
  },
  metricPillTete: {
    backgroundColor: "#FF980012",
    borderColor: "#FF980020",
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  metricValue: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
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
  emptyText: {
    fontSize: 13,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
  },
  headerButton: {
    padding: 6,
  },
  modalLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  dateRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  dateButton: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    backgroundColor: "#f5f6f8",
  },
  dateButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a4f55",
  },
  selectedDateRow: {
    alignItems: "center",
    paddingVertical: 8,
  },
  selectedDateText: {
    fontSize: 13,
    color: "#6c757d",
  },
  selectedTimeText: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
