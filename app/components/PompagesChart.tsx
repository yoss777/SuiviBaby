import { Timestamp } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Text,
  TouchableOpacity,
  View,
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
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // lundi comme début
  return new Date(d.setDate(diff));
}

function addWeeks(date: Date, weeks: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

export default function PompagesChart({ pompages }: Props) {
  const chartWidth = Dimensions.get("window").width - 40;
  const chartHeight = 250;
  const [currentDay, setCurrentDay] = useState<Date>(startOfDay(new Date()));
  const [currentWeek, setCurrentWeek] = useState<Date>(
    getStartOfWeek(new Date())
  );

  if (!pompages || pompages.length === 0) {
    return (
      <View>
        <ActivityIndicator size="large" />
        <Text style={{ textAlign: "center", fontSize: 16, marginTop: 20 }}>
          Aucune donnée de pompage disponible.
        </Text>
      </View>
    );
  }

  // Préparer les données journalières
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
  const dailyRecordIndex = dailyValues.indexOf(maxDaily);
  const dailySegments = Math.ceil(maxDaily / 100);

  const chartConfig = {
    backgroundColor: "#fff",
    backgroundGradientFrom: "#f5f5f5",
    backgroundGradientTo: "#f5f5f5",
    decimalPlaces: 0,
    color: () => "#4A90E2",
    labelColor: () => "rgba(0,0,0,1)",
  };

  // Préparer les données hebdomadaires
  const weekStart = getStartOfWeek(currentWeek);
  const weekEnd = addWeeks(weekStart, 1);
  const jours = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
  const weeklyData: Record<string, number> = {
    lun: 0,
    mar: 0,
    mer: 0,
    jeu: 0,
    ven: 0,
    sam: 0,
    dim: 0,
  };

  pompages.forEach((p) => {
    const d = p.date instanceof Timestamp ? p.date.toDate() : new Date(p.date);
    if (d >= weekStart && d < weekEnd) {
      const jour = d
        .toLocaleDateString("fr-FR", { weekday: "short" })
        .slice(0, 3);
      const total = (p.quantiteDroite || 0) + (p.quantiteGauche || 0);
      if (weeklyData[jour] !== undefined) weeklyData[jour] += total;
    }
  });

  const weeklyValues = jours.map((j) => weeklyData[j]);
  const maxWeekly = Math.max(...weeklyValues);
  const weeklyRecordIndex = weeklyValues.indexOf(maxWeekly);
  const weeklySegments = Math.ceil(maxWeekly / 100);

  return (
    <View style={{ padding: 10 }}>
      {/* JOUR */}
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "bold",
            marginBottom: 10,
          }}
        >
          Production (ml)
        </Text>
        <Text
          style={{
            textAlign: "center",
            fontSize: 18,
            fontWeight: "bold",
            marginBottom: 10,
          }}
        >
          {currentDay.toLocaleDateString("fr-FR", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginHorizontal: 20,
          marginBottom: 20,
          marginTop: 10,
        }}
      >
        <TouchableOpacity
          onPress={() => setCurrentDay(addDays(currentDay, -1))}
        >
          <Text style={{ fontSize: 16 }}>⬅️ Jour préc.</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCurrentDay(addDays(currentDay, 1))}>
          <Text style={{ fontSize: 16 }}>Jour suiv. ➡️</Text>
        </TouchableOpacity>
      </View>

      {dailyValues.length === 0 ? (
        <Text style={{ textAlign: "center", marginTop: 20, fontSize: 16 }}>
          Aucune donnée pour ce jour.
        </Text>
      ) : (
        <LineChart
          data={{ labels: dailyLabels, datasets: [{ data: dailyValues }] }}
          width={chartWidth}
          height={chartHeight}
          fromZero
          segments={dailySegments}
          yAxisSuffix=" ml"
          chartConfig={chartConfig}
          bezier
          style={{ borderRadius: 16 }}
          renderDotContent={({ x, y, index }) =>
            index === dailyRecordIndex ? (
              <View
                key={index}
                style={{
                  position: "absolute",
                  top: y - 6,
                  left: x - 6,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: "#FF8C00",
                }}
              />
            ) : null
          }
        />
      )}

      <Text
        style={{
          textAlign: "center",
          fontSize: 20,
          marginTop: 10,
          color: "#0351aaff",
          fontWeight: "bold",
        }}
      >
        {`Total du jour : ${dailyValues.reduce((a, b) => a + b, 0)} ml`}
      </Text>

      <View
        style={{ height: 1, backgroundColor: "#ccc", marginVertical: 20 }}
      />

      {/* SEMAINE */}
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "bold",
            marginBottom: 10,
          }}
        >
          Production (ml)
        </Text>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "bold",
            marginBottom: 10,
          }}
        >
          {`du ${weekStart.toLocaleDateString("fr-FR")} au ${new Date(
            weekEnd.getTime() - 1
          ).toLocaleDateString("fr-FR")}`}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginHorizontal: 20,
          marginBottom: 20,
        }}
      >
        <TouchableOpacity
          onPress={() => setCurrentWeek(addWeeks(currentWeek, -1))}
        >
          <Text style={{ fontSize: 16 }}>⬅️ Semaine préc.</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setCurrentWeek(addWeeks(currentWeek, 1))}
        >
          <Text style={{ fontSize: 16 }}>Semaine suiv. ➡️</Text>
        </TouchableOpacity>
      </View>

      <BarChart
        data={{
          labels: jours,
          datasets: [
            {
              data: weeklyValues,
              colors: weeklyValues.map((_, i) =>
                i === weeklyRecordIndex ? () => "#FF8C00" : () => "#4A90E2"
              ),
            },
          ],
        }}
        width={chartWidth}
        height={chartHeight}
        fromZero
        segments={weeklySegments}
        yAxisSuffix=" ml"
        chartConfig={{
          ...chartConfig,
          color: (opacity = 1, index?: number) =>
            index === weeklyRecordIndex
              ? `rgba(255,140,0,${opacity})`
              : `rgba(74,144,226,${opacity})`,
        }}
        style={{
          borderRadius: 16,
          marginBottom: 20,
          paddingRight: 10,
          marginRight: 20,
        }}
        showValuesOnTopOfBars
        withCustomBarColorFromData
      />

      <Text
        style={{
          textAlign: "center",
          fontSize: 20,
          marginBottom: 10,
          color: "#0351aaff",
          fontWeight: "bold",
        }}
      >
        Total semaine : {weeklyValues.reduce((a, b) => a + b, 0)} ml
      </Text>
    </View>
  );
}
