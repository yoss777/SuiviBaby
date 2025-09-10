import { ecouterVaccins } from "@/services/vaccinsService";
import { ecouterVitamines } from "@/services/vitaminesService";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Vaccin, Vitamine } from "../types/interfaces";
import VaccinsScreen from "../vaccins";
import VitaminesScreen from "../vitamines";

export default function ImmunosScreen() {
  const [vitamines, setVitamines] = useState<Vitamine[]>([]);
  const [vaccins, setVaccins] = useState<Vaccin[]>([]);
  const [selectedTab, setSelectedTab] = useState<"vitamines" | "vaccins">(
    "vitamines"
  );

  // Récupérer les paramètres de l'URL
  const { tab } = useLocalSearchParams();

  // Définir l'onglet initial en fonction du paramètre
  useEffect(() => {
    if (tab === "vaccins") {
      setSelectedTab("vaccins");
    } else if (tab === "vitamines") {
      setSelectedTab("vitamines");
    }
    // Ne pas changer l'onglet si aucun paramètre 'tab' n'est fourni
  }, [tab]);

  // écoute en temps réel des tetees
  useEffect(() => {
    const unsubscribeVitamines = ecouterVitamines(setVitamines);
    return () => unsubscribeVitamines();
  }, []);

  // écoute en temps réel des pompages
  useEffect(() => {
    const unsubscribeVaccins = ecouterVaccins(setVaccins);
    return () => unsubscribeVaccins();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* BOUTONS DE SÉLECTION */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            selectedTab === "vitamines" && styles.tabButtonActive,
          ]}
          onPress={() => setSelectedTab("vitamines")}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "vitamines" && styles.tabTextActive,
            ]}
          >
            Vitamines
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            selectedTab === "vaccins" && styles.tabButtonActive,
          ]}
          onPress={() => setSelectedTab("vaccins")}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "vaccins" && styles.tabTextActive,
            ]}
          >
            Vaccins
          </Text>
        </TouchableOpacity>
      </View>

      {/* SCROLLVIEW DES CHARTS */}
      <View style={styles.container}>
        {selectedTab === "vitamines" ? (
          <VitaminesScreen vitamines={vitamines} />
        ) : (
          <VaccinsScreen vaccins={vaccins} />
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
  tabContainer: {
    flexDirection: "row",
    justifyContent: "center",
    paddingTop: 10,
    gap: 10,
    backgroundColor: "#f8f9fa",
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#eee",
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: "#4A90E2",
  },
  tabText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "bold",
  },
  tabTextActive: {
    color: "white",
  },
});
