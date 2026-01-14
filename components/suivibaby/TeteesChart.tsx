import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BarChart } from "react-native-chart-kit";

type Props = {
  tetees: any[];
};

function getStartOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  // Convertir dimanche (0) en 7 pour faciliter le calcul
  const dayOfWeek = day === 0 ? 7 : day;
  // Calculer combien de jours soustraire pour arriver au lundi
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
  const [viewMode, setViewMode] = useState<"quantity" | "frequency">("quantity");
  const [typeFilter, setTypeFilter] = useState<"tous" | "seins" | "biberons">("tous");
  const [currentWeek, setCurrentWeek] = useState<Date>(getStartOfWeek(new Date()));

  const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const chartWidth = Dimensions.get("window").width - 40;
  const chartHeight = 220;

  // Forcer viewMode à "frequency" quand typeFilter est "seins"
  useEffect(() => {
    if (typeFilter === "seins") {
      setViewMode("frequency");
    }
  }, [typeFilter]);

  // Vérification précoce pour éviter les problèmes de hooks
  const isEmpty = !tetees || tetees.length === 0;

  if (isEmpty) {
    return (
      <View style={styles.emptyContainer}>
        <FontAwesome name="baby" size={64} color="#e9ecef" />
        <Text style={styles.emptyTitle}>Aucune donnée disponible</Text>
        <Text style={styles.emptySubtitle}>
          Commencez à enregistrer des tétées pour voir les statistiques
        </Text>
      </View>
    );
  }

  // Semaine courante
  const start = getStartOfWeek(currentWeek);
  const end = addWeeks(start, 1);

  // Filtrer les tétées selon le type sélectionné
  const filteredTetees = tetees.filter((t) => {
    if (typeFilter === "tous") return true;
    // OLD: type="seins" ou type="biberons", NEW: type="tetee" ou type="biberon"
    const type = t.type || "seins"; // Défaut pour les anciennes données

    if (typeFilter === "seins") {
      // Accepter: type="seins" (OLD) OU type="tetee" (NEW) OU undefined (très anciennes données)
      return type === "seins" || type === "tetee" || !t.type;
    }
    if (typeFilter === "biberons") {
      // Accepter: type="biberons" (OLD) OU type="biberon" (NEW)
      return type === "biberons" || type === "biberon";
    }
    return false;
  });

  // Calcul des totaux journaliers avec séparation par type
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
    Lun: { quantity: 0, count: 0, seinsCount: 0, biberonsCount: 0, biberonsQuantity: 0 },
    Mar: { quantity: 0, count: 0, seinsCount: 0, biberonsCount: 0, biberonsQuantity: 0 },
    Mer: { quantity: 0, count: 0, seinsCount: 0, biberonsCount: 0, biberonsQuantity: 0 },
    Jeu: { quantity: 0, count: 0, seinsCount: 0, biberonsCount: 0, biberonsQuantity: 0 },
    Ven: { quantity: 0, count: 0, seinsCount: 0, biberonsCount: 0, biberonsQuantity: 0 },
    Sam: { quantity: 0, count: 0, seinsCount: 0, biberonsCount: 0, biberonsQuantity: 0 },
    Dim: { quantity: 0, count: 0, seinsCount: 0, biberonsCount: 0, biberonsQuantity: 0 },
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
        // OLD: type="seins", NEW: type="tetee"
        if (type === "seins" || type === "tetee" || !t.type) {
          weeklyData[jourKey].seinsCount += 1;
        }
        // OLD: type="biberons", NEW: type="biberon"
        else if (type === "biberons" || type === "biberon") {
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
  const totalSeinsCount = jours.reduce((acc, j) => acc + weeklyData[j].seinsCount, 0);
  const totalBiberonsCount = jours.reduce((acc, j) => acc + weeklyData[j].biberonsCount, 0);

  const dailyAverageQuantity = totalWeekQuantity > 0 ? Math.round(totalWeekQuantity / 7) : 0;
  const dailyAverageCount = totalWeekCount > 0 ? Math.round((totalWeekCount / 7) * 10) / 10 : 0;

  const maxQuantity = Math.max(...quantityValues);
  const maxCount = Math.max(...countValues);
  const bestQuantityDay = jours[quantityValues.indexOf(maxQuantity)];
  const bestCountDay = jours[countValues.indexOf(maxCount)];

  const currentValues = viewMode === "quantity" ? quantityValues : countValues;
  const currentMax = viewMode === "quantity" ? maxQuantity : maxCount;

  // Configuration du graphique avec couleurs pour les barres et les étiquettes
  const getBarAndLabelColor = (value: number, index: number) => {
    if (value === 0) {
      return { barColor: "#e9ecef", labelColor: "#333333" };
    }
    if (typeFilter === "seins") {
      return { barColor: "#28a745", labelColor: "#1a7431" }; // Vert plus foncé pour les étiquettes
    }
    if (typeFilter === "biberons") {
      return { barColor: "#17a2b8", labelColor: "#0c5460" }; // Bleu cyan foncé pour les étiquettes
    }
    return {
      barColor: value === currentMax ? "#ffc107" : "#4A90E2",
      labelColor: value === currentMax ? "#b28704" : "#2a6395",
    };
  };

  const chartConfig = {
    backgroundColor: "#fff",
    backgroundGradientFrom: "#f8f9fa",
    backgroundGradientTo: "#f8f9fa",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(74, 144, 226, ${opacity})`,
    labelColor: (opacity = 1, index?: number) => {
      const val = currentValues[index || 0];
      return getBarAndLabelColor(val, index || 0).labelColor.replace(")", `, ${opacity})`).replace("rgb", "rgba");
    },
    strokeWidth: 2,
    barPercentage: 0.7,
    fillShadowGradient: "#4A90E2",
    fillShadowGradientOpacity: 0.3,
    propsForLabels: {
      fontSize: 12,
      fontWeight: "600",
    },
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <FontAwesome name="baby" size={20} color="#4A90E2" />
          <Text style={styles.sectionTitle}>Statistiques des tétées</Text>
        </View>

        <View style={styles.dateHeader}>
          <Text style={styles.weekRange}>
            {`${start.toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
            })} - ${new Date(end.getTime() - 1).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
            })}`}
          </Text>
        </View>

        <View style={styles.navigationRow}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setCurrentWeek(addWeeks(currentWeek, -1))}
          >
            <FontAwesome name="chevron-left" size={16} color="#666" />
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
            <FontAwesome name="chevron-right" size={16} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Filtre par type */}
        <View style={styles.typeFilterContainer}>
          {[
            { key: "tous", label: "Tous", icon: "baby" },
            { key: "seins", label: "Seins", icon: "person-breastfeeding" },
            { key: "biberons", label: "Biberons", icon: "jar-wheat" },
          ].map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.typeFilterButton,
                typeFilter === type.key && styles.typeFilterButtonActive,
                typeFilter === type.key && type.key === "seins" && styles.typeFilterButtonSeins,
                typeFilter === type.key && type.key === "biberons" && styles.typeFilterButtonBiberons,
              ]}
              onPress={() => setTypeFilter(type.key as "tous" | "seins" | "biberons")}
            >
              <FontAwesome
                name={type.icon}
                size={14}
                color={typeFilter === type.key ? "white" : "#666"}
              />
              <Text
                style={[
                  styles.typeFilterText,
                  typeFilter === type.key && styles.typeFilterTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Toggle pour changer de vue */}
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
                size={16}
                color={viewMode === "quantity" ? "white" : "#666"}
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
              size={16}
              color={viewMode === "frequency" ? "white" : "#666"}
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

        <BarChart
          data={{
            labels: jours,
            datasets: [
              {
                data: currentValues.length > 0 ? currentValues : [0],
                colors: currentValues.map((val, i) => () => getBarAndLabelColor(val, i).barColor),
              },
            ],
          }}
          width={chartWidth}
          height={chartHeight}
          fromZero
          yAxisSuffix={viewMode === "quantity" ? " ml" : ""}
          chartConfig={chartConfig}
          style={styles.chart}
          showValuesOnTopOfBars
          withCustomBarColorFromData
        />

        {/* Statistiques détaillées */}
        {typeFilter === "tous" ? (
          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{totalWeekCount}</Text>
                <Text style={styles.statLabel}>Total tétées</Text>
              </View>
              <View style={styles.statItem}>
                <FontAwesome name="person-breastfeeding" size={14} color="#28a745" />
                <Text style={[styles.statValue, { color: "#28a745" }]}>{totalSeinsCount}</Text>
                <Text style={styles.statLabel}>Seins</Text>
              </View>
              <View style={styles.statItem}>
                <FontAwesome name="jar-wheat" size={14} color="#17a2b8" />
                <Text style={[styles.statValue, { color: "#17a2b8" }]}>{totalBiberonsCount}</Text>
                <Text style={styles.statLabel}>Biberons</Text>
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
                <Text style={[styles.statValue, { color: "#17a2b8" }]}>{totalWeekQuantity} ml</Text>
                <Text style={styles.statLabel}>Total semaine</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: "#17a2b8" }]}>{dailyAverageQuantity} ml</Text>
                <Text style={styles.statLabel}>Moyenne/jour</Text>
              </View>
              {maxQuantity > 0 && (
                <View style={styles.statItem}>
                  <FontAwesome name="trophy" size={16} color="#ffc107" />
                  <Text style={[styles.statValue, { color: "#ffc107" }]}>{bestQuantityDay}</Text>
                  <Text style={styles.statLabel}>Record: {maxQuantity} ml</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, typeFilter === "seins" ? { color: "#28a745" } : { color: "#17a2b8" }]}>
                  {totalWeekCount}
                </Text>
                <Text style={styles.statLabel}>Total tétées</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, typeFilter === "seins" ? { color: "#28a745" } : { color: "#17a2b8" }]}>
                  {dailyAverageCount}
                </Text>
                <Text style={styles.statLabel}>Moyenne/jour</Text>
              </View>
              {maxCount > 0 && (
                <View style={styles.statItem}>
                  <FontAwesome name="trophy" size={16} color="#ffc107" />
                  <Text style={[styles.statValue, { color: "#ffc107" }]}>
                    {bestCountDay}
                  </Text>
                  <Text style={styles.statLabel}>
                    Record: {maxCount} tétées
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Conseils contextuels améliorés */}
        {totalWeekCount > 0 && (
          <View style={styles.insightContainer}>
            <FontAwesome name="lightbulb" size={16} color="#17a2b8" />
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>
                {typeFilter === "tous"
                  ? "Aperçu global de la semaine"
                  : `Aperçu ${typeFilter} de la semaine`}
              </Text>
              <Text style={styles.insightText}>
                {typeFilter === "tous"
                  ? `Cette semaine: ${totalSeinsCount} tétées au sein, ${totalBiberonsCount} biberons (${totalWeekQuantity} ml au total). ${
                      totalSeinsCount > totalBiberonsCount
                        ? "L'allaitement domine cette semaine."
                        : totalBiberonsCount > totalSeinsCount
                        ? "Les biberons dominent cette semaine."
                        : "Équilibre entre seins et biberons."
                    }`
                  : typeFilter === "seins"
                  ? `${totalSeinsCount} tétées au sein cette semaine, soit ${dailyAverageCount} par jour en moyenne. ${
                      maxCount > dailyAverageCount * 1.5
                        ? `Le ${bestCountDay} a été particulièrement actif.`
                        : "Rythme régulier cette semaine."
                    }`
                  : `${totalWeekQuantity} ml de lait en biberon cette semaine (${totalBiberonsCount} biberons). Moyenne de ${dailyAverageQuantity} ml par jour.`}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
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
    backgroundColor: "white",
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 4,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#212529",
  },
  dateHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  weekRange: {
    fontSize: 16,
    fontWeight: "500",
    color: "#495057",
  },
  navigationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  navText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  todayButton: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  todayText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  typeFilterContainer: {
    flexDirection: "row",
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    justifyContent: "space-between",
  },
  typeFilterButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  typeFilterButtonActive: {
    backgroundColor: "#4A90E2",
  },
  typeFilterButtonSeins: {
    backgroundColor: "#28a745",
  },
  typeFilterButtonBiberons: {
    backgroundColor: "#17a2b8",
  },
  typeFilterText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  typeFilterTextActive: {
    color: "white",
    fontWeight: "600",
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  toggleButtonActive: {
    backgroundColor: "#4A90E2",
  },
  toggleText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  toggleTextActive: {
    color: "white",
    fontWeight: "600",
  },
  chart: {
    borderRadius: 12,
    marginVertical: 8,
  },
  statsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e9ecef",
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
    color: "#4A90E2",
  },
  statLabel: {
    fontSize: 11,
    color: "#6c757d",
    textAlign: "center",
  },
  insightContainer: {
    flexDirection: "row",
    backgroundColor: "#e3f2fd",
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
    fontWeight: "600",
    color: "#1976d2",
    marginBottom: 4,
  },
  insightText: {
    fontSize: 13,
    color: "#1565c0",
    lineHeight: 18,
  },
});