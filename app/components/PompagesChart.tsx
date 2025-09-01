import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { Timestamp } from "firebase/firestore";
import { useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { BarChart, LineChart } from "react-native-chart-kit";

type Props = {
  pompages: any[];
};

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
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function addWeeks(date: Date, weeks: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

export default function PompagesChart({ pompages }: Props) {
  const chartWidth = Dimensions.get("window").width - 40;
  const chartHeight = 220;
  const [currentDay, setCurrentDay] = useState<Date>(startOfDay(new Date()));
  const [currentWeek, setCurrentWeek] = useState<Date>(
    getStartOfWeek(new Date())
  );

  if (!pompages || pompages.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <FontAwesome name="pump-medical" size={64} color="#e9ecef" />
        <Text style={styles.emptyTitle}>Aucune donnée disponible</Text>
        <Text style={styles.emptySubtitle}>
          Commencez à enregistrer vos sessions pour voir les statistiques
        </Text>
      </View>
    );
  }

  // Données journalières
  const dailyPompages = pompages
    .map((p) => ({
      ...p,
      dateObj: p.date instanceof Timestamp ? p.date.toDate() : new Date(p.date),
      totalQuantite: (p.quantiteDroite || 0) + (p.quantiteGauche || 0),
    }))
    .filter((p) => startOfDay(p.dateObj).getTime() === currentDay.getTime())
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  const dailyValues = dailyPompages.map((p) => p.totalQuantite);
  const dailyLabels = dailyPompages.map((p) =>
    p.dateObj.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );

  const maxDaily = Math.max(...dailyValues, 0);
  const dailyTotal = dailyValues.reduce((a, b) => a + b, 0);
  const dailyAverage = dailyValues.length > 0 ? Math.round(dailyTotal / dailyValues.length) : 0;

  // Configuration des graphiques
  const chartConfig = {
    backgroundColor: "#fff",
    backgroundGradientFrom: "#f8f9fa",
    backgroundGradientTo: "#f8f9fa",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(40, 167, 69, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.7,
    fillShadowGradient: "#28a745",
    fillShadowGradientOpacity: 0.3,
  };

  // Données hebdomadaires
  const weekStart = getStartOfWeek(currentWeek);
  const weekEnd = addWeeks(weekStart, 1);
  const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const weeklyData: Record<string, number> = {
    Lun: 0, Mar: 0, Mer: 0, Jeu: 0, Ven: 0, Sam: 0, Dim: 0,
  };

  pompages.forEach((p) => {
    const d = p.date instanceof Timestamp ? p.date.toDate() : new Date(p.date);
    if (d >= weekStart && d < weekEnd) {
      const jour = d.toLocaleDateString("fr-FR", { weekday: "short" });
      const jourKey = jour.charAt(0).toUpperCase() + jour.slice(1, 3);
      const total = (p.quantiteDroite || 0) + (p.quantiteGauche || 0);
      if (weeklyData[jourKey] !== undefined) weeklyData[jourKey] += total;
    }
  });

  const weeklyValues = jours.map((j) => weeklyData[j]);
  const maxWeekly = Math.max(...weeklyValues);
  const weeklyTotal = weeklyValues.reduce((a, b) => a + b, 0);
  const weeklyAverage = Math.round(weeklyTotal / 7);
  const bestDay = jours[weeklyValues.indexOf(maxWeekly)];

  return (
    <View style={styles.container}>
      {/* Section Vue Journalière */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <FontAwesome name="calendar-day" size={20} color="#28a745" />
          <Text style={styles.sectionTitle}>Vue journalière</Text>
        </View>

        <View style={styles.dateHeader}>
          <Text style={styles.currentDate}>
            {currentDay.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Text>
        </View>

        <View style={styles.navigationRow}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setCurrentDay(addDays(currentDay, -1))}
          >
            <FontAwesome name="chevron-left" size={16} color="#666" />
            <Text style={styles.navText}>Préc.</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.todayButton}
            onPress={() => setCurrentDay(startOfDay(new Date()))}
          >
            <Text style={styles.todayText}>Aujourd'hui</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setCurrentDay(addDays(currentDay, 1))}
          >
            <Text style={styles.navText}>Suiv.</Text>
            <FontAwesome name="chevron-right" size={16} color="#666" />
          </TouchableOpacity>
        </View>

        {dailyValues.length === 0 ? (
          <View style={styles.noDataContainer}>
            <FontAwesome name="info-circle" size={24} color="#6c757d" />
            <Text style={styles.noDataText}>Aucune session ce jour</Text>
          </View>
        ) : (
          <>
            <LineChart
              data={{ 
                labels: dailyLabels.length > 6 ? 
                  dailyLabels.map((_, i) => i % 2 === 0 ? dailyLabels[i] : '') : 
                  dailyLabels, 
                datasets: [{ data: dailyValues }] 
              }}
              width={chartWidth}
              height={chartHeight}
              fromZero
              yAxisSuffix=" ml"
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
              withDots={true}
              withShadow={false}
              withVerticalLabels={true}
              withHorizontalLabels={true}
              renderDotContent={({ x, y, index }) => {
                const dailyRecordIndex = dailyValues.indexOf(maxDaily);
                return index === dailyRecordIndex ? (
                  <View
                    key={index}
                    style={{
                      position: "absolute",
                      top: y - 6,
                      left: x - 6,
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: "#ffc107",
                    }}
                  />
                ) : null;
              }}
            />
            
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{dailyTotal} ml</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{dailyValues.length}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{dailyAverage} ml</Text>
                <Text style={styles.statLabel}>Moyenne</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Section Vue Hebdomadaire */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <FontAwesome name="calendar-week" size={20} color="#28a745" />
          <Text style={styles.sectionTitle}>Vue hebdomadaire</Text>
        </View>

        <View style={styles.dateHeader}>
          <Text style={styles.weekRange}>
            {`${weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} - ${new Date(weekEnd.getTime() - 1).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
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

        <BarChart
          data={{
            labels: jours,
            datasets: [{
              data: weeklyValues,
              colors: weeklyValues.map((val, i) =>
                val === maxWeekly && val > 0 ? () => "#ffc107" : () => "#28a745"
              ),
            }],
          }}
          width={chartWidth}
          height={chartHeight}
          fromZero
          yAxisSuffix=" ml"
          chartConfig={{
            ...chartConfig,
            color: (opacity = 1, index?: number) => {
              const val = weeklyValues[index || 0];
              return val === maxWeekly && val > 0 
                ? `rgba(255, 193, 7, ${opacity})` 
                : `rgba(40, 167, 69, ${opacity})`;
            },
          }}
          style={styles.chart}
          showValuesOnTopOfBars
          withCustomBarColorFromData
        />

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{weeklyTotal} ml</Text>
            <Text style={styles.statLabel}>Total semaine</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{weeklyAverage} ml</Text>
            <Text style={styles.statLabel}>Moyenne/jour</Text>
          </View>
          {maxWeekly > 0 && (
            <View style={styles.statItem}>
              <FontAwesome name="trophy" size={16} color="#ffc107" />
              <Text style={[styles.statValue, { color: "#ffc107" }]}>{bestDay}</Text>
              <Text style={styles.statLabel}>Jour record: {maxWeekly} ml</Text>
            </View>
          )}
        </View>
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
    marginVertical: 8,
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
  currentDate: {
    fontSize: 18,
    fontWeight: "600",
    color: "#495057",
    textTransform: "capitalize",
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
    backgroundColor: "#28a745",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  todayText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  chart: {
    borderRadius: 12,
    marginVertical: 8,
  },
  noDataContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  noDataText: {
    fontSize: 16,
    color: "#6c757d",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e9ecef",
  },
  statItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#28a745",
  },
  statLabel: {
    fontSize: 12,
    color: "#6c757d",
    textAlign: "center",
  },
});