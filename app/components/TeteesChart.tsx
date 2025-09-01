import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { Timestamp } from "firebase/firestore";
import { useState } from "react";
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
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setHours(0, 0, 0, 0));
}

function addWeeks(date: Date, weeks: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

export default function TeteesChart({ tetees }: Props) {
  const [viewMode, setViewMode] = useState<"quantity" | "frequency">(
    "quantity"
  );
  const [currentWeek, setCurrentWeek] = useState<Date>(
    getStartOfWeek(new Date())
  );
  const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const chartWidth = Dimensions.get("window").width - 40;
  const chartHeight = 220;

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

  // Calcul des totaux journaliers
  const weeklyData: Record<string, { quantity: number; count: number }> = {
    Lun: { quantity: 0, count: 0 },
    Mar: { quantity: 0, count: 0 },
    Mer: { quantity: 0, count: 0 },
    Jeu: { quantity: 0, count: 0 },
    Ven: { quantity: 0, count: 0 },
    Sam: { quantity: 0, count: 0 },
    Dim: { quantity: 0, count: 0 },
  };

  tetees.forEach((t) => {
    const d = t.date instanceof Timestamp ? t.date.toDate() : new Date(t.date);

    if (d >= start && d < end) {
      const jour = d.toLocaleDateString("fr-FR", { weekday: "short" });
      const jourKey = jour.charAt(0).toUpperCase() + jour.slice(1, 3);
      const quantiteTotale =
        (t.quantiteDroite || 0) + (t.quantiteGauche || 0) + (t.quantite || 0);

      if (weeklyData[jourKey]) {
        weeklyData[jourKey].quantity += quantiteTotale;
        weeklyData[jourKey].count += 1;
      }
    }
  });

  const quantityValues = jours.map((j) => weeklyData[j].quantity);
  const countValues = jours.map((j) => weeklyData[j].count);

  const totalWeekQuantity = quantityValues.reduce((acc, v) => acc + v, 0);
  const totalWeekCount = countValues.reduce((acc, v) => acc + v, 0);
  const dailyAverageQuantity =
    totalWeekQuantity > 0 ? Math.round(totalWeekQuantity / 7) : 0;
  const dailyAverageCount =
    totalWeekCount > 0 ? Math.round((totalWeekCount / 7) * 10) / 10 : 0;

  const maxQuantity = Math.max(...quantityValues);
  const maxCount = Math.max(...countValues);
  const bestQuantityDay = jours[quantityValues.indexOf(maxQuantity)];
  const bestCountDay = jours[countValues.indexOf(maxCount)];

  const currentValues = viewMode === "quantity" ? quantityValues : countValues;
  const currentMax = viewMode === "quantity" ? maxQuantity : maxCount;

  // Configuration du graphique
  const chartConfig = {
    backgroundColor: "#fff",
    backgroundGradientFrom: "#f8f9fa",
    backgroundGradientTo: "#f8f9fa",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(74, 144, 226, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.7,
    fillShadowGradient: "#4A90E2",
    fillShadowGradientOpacity: 0.3,
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

        {/* Toggle pour changer de vue */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              viewMode === "quantity" && styles.toggleButtonActive,
            ]}
            onPress={() => setViewMode("quantity")}
          >
            <FontAwesome
              name="tint"
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
                colors: currentValues.map((val, i) =>
                  val === currentMax && val > 0
                    ? () => "#ffc107"
                    : () => "#4A90E2"
                ),
              },
            ],
          }}
          width={chartWidth}
          height={chartHeight}
          fromZero
          yAxisSuffix={viewMode === "quantity" ? " ml" : ""}
          chartConfig={{
            ...chartConfig,
            color: (opacity = 1, index?: number) => {
              const val = currentValues[index || 0];
              return val === currentMax && val > 0
                ? `rgba(255, 193, 7, ${opacity})`
                : `rgba(74, 144, 226, ${opacity})`;
            },
          }}
          style={styles.chart}
          showValuesOnTopOfBars
          withCustomBarColorFromData
        />

        {/* Statistiques */}
        {viewMode === "quantity" ? (
          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{totalWeekQuantity} ml</Text>
                <Text style={styles.statLabel}>Total semaine</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{dailyAverageQuantity} ml</Text>
                <Text style={styles.statLabel}>Moyenne/jour</Text>
              </View>
              {maxQuantity > 0 && (
                <View style={styles.statItem}>
                  <FontAwesome name="trophy" size={16} color="#ffc107" />
                  <Text style={[styles.statValue, { color: "#ffc107" }]}>
                    {bestQuantityDay}
                  </Text>
                  <Text style={styles.statLabel}>Record: {maxQuantity} ml</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{totalWeekCount}</Text>
                <Text style={styles.statLabel}>Total tétées</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{dailyAverageCount}</Text>
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

        {/* Conseils contextuels */}
        {totalWeekQuantity > 0 && (
          <View style={styles.insightContainer}>
            <FontAwesome name="lightbulb" size={16} color="#17a2b8" />
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>Aperçu de la semaine</Text>
              <Text style={styles.insightText}>
                {viewMode === "quantity"
                  ? `Consommation moyenne de ${dailyAverageQuantity} ml par jour. ${
                      maxQuantity > dailyAverageQuantity * 1.5
                        ? `Le ${bestQuantityDay} a été particulièrement actif avec ${maxQuantity} ml.`
                        : "Consommation régulière cette semaine."
                    }`
                  : `En moyenne ${dailyAverageCount} tétées par jour. ${
                      maxCount > dailyAverageCount * 1.5
                        ? `Le ${bestCountDay} a eu le plus de tétées (${maxCount}).`
                        : "Rythme régulier cette semaine."
                    }`}
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
    margin: 16,
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
  },
  statItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4A90E2",
  },
  statLabel: {
    fontSize: 12,
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
