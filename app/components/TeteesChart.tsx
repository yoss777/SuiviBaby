import { Timestamp } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BarChart } from "react-native-chart-kit";

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

export default function TeteesChart({ tetees }: { tetees: any[] }) {
  const [currentWeek, setCurrentWeek] = useState<Date>(
    getStartOfWeek(new Date())
  );
  const jours = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
  const chartWidth = Dimensions.get("window").width - 40;
  const chartHeight = 250;

  if (!tetees || tetees.length === 0) {
    return (
      <View>
        <ActivityIndicator size="large" />
        <Text style={{ textAlign: "center", fontSize: 16, marginTop: 20 }}>
          Aucune donnée de tétée disponible.
        </Text>
      </View>
    );
  }

  // Semaine courante
  const start = getStartOfWeek(currentWeek);
  const end = addWeeks(start, 1);

  // Totaux journaliers
  const data: Record<string, number> = {
    lun: 0,
    mar: 0,
    mer: 0,
    jeu: 0,
    ven: 0,
    sam: 0,
    dim: 0,
  };

  tetees.forEach((t) => {
    // Conversion Timestamp ou string en Date
    const d = t.date instanceof Timestamp ? t.date.toDate() : new Date(t.date);

    if (d >= start && d < end) {
      const jour = d
        .toLocaleDateString("fr-FR", { weekday: "short" })
        .slice(0, 3);
      const quantiteTotale =
        (t.quantiteDroite || 0) + (t.quantiteGauche || 0) + (t.quantite || 0);
      if (data[jour] !== undefined) data[jour] += quantiteTotale;
    }
  });

  const values = jours.map((j) => data[j]);
  const totalSemaine = values.reduce((acc, v) => acc + v, 0);
  const moyenneJour = totalSemaine / 7;
  const maxVal = Math.max(...values);
  const jourRecordIndex = values.indexOf(maxVal);

  // Axe Y par palier de 100 ml
  const yMin = 0;
  const segmentStep = 100;
  const yMax =
    Math.ceil(Math.max(maxVal, segmentStep) / segmentStep) * segmentStep;
  const segments = yMax / segmentStep;

  return (
    <View style={{ padding: 10 }}>
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "bold",
            marginBottom: 10,
          }}
        >
          Consommation (ml)
        </Text>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "bold",
            marginBottom: 10,
          }}
        >
          {`du ${start.toLocaleDateString("fr-FR")} au ${new Date(
            end.getTime() - 1
          ).toLocaleDateString("fr-FR")}`}
        </Text>
      </View>

      {/* Navigation semaine */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginHorizontal: 20,
          marginVertical: 10,
          // alignItems: "center",
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
              data: values,
              colors: values.map((_, i) =>
                i === jourRecordIndex ? () => "#FF8C00" : () => "#4A90E2"
              ),
            },
          ],
        }}
        width={chartWidth}
        height={chartHeight}
        fromZero={true} // commence à 0
        segments={segments} // lignes horizontales par palier de 100
        yAxisLabel=""
        yAxisSuffix=" ml"
        yAxisInterval={1}
        chartConfig={{
          backgroundColor: "#fff",
          backgroundGradientFrom: "#f5f5f5",
          backgroundGradientTo: "#f5f5f5",
          decimalPlaces: 0,
          color: (opacity = 1, index?: number) =>
            index === jourRecordIndex
              ? `rgba(255, 140, 0, ${opacity})`
              : `rgba(74, 144, 226, ${opacity})`,
          labelColor: () => "rgba(0,0,0,1)",
        }}
        style={{ borderRadius: 16, paddingRight: 10, marginRight: 20 }}
        showValuesOnTopOfBars
        // flatColor
        withCustomBarColorFromData={true} // ✅ nécessaire
      />

      {/* Statistiques */}
      <Text
        style={{
          textAlign: "center",
          fontSize: 18,
          fontWeight: "bold",
          marginTop: 10,
        }}
      >
        Total de la semaine : {totalSemaine} ml
      </Text>
      <Text style={{ textAlign: "center", fontSize: 16, marginTop: 5 }}>
        Moyenne par jour : {Math.round(moyenneJour)} ml
      </Text>
      {jourRecordIndex !== -1 && (
        <Text
          style={{
            textAlign: "center",
            fontSize: 16,
            marginTop: 5,
            color: "#FF8C00",
          }}
        >
          🏆 Jour record : {jours[jourRecordIndex]} avec {maxVal} ml
        </Text>
      )}
    </View>
  );
}
