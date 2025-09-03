import { ecouterMictions } from "@/services/mictionsService";
import { ecouterSelles } from "@/services/sellesService";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MictionsScreen from "../mictions";
import SellesScreen from "../selles";
import { Miction, Selle } from "../types/interfaces";

export default function HomeScreen() {
  const [mictions, setMictions] = useState<Miction[]>([]);
  const [selles, setSelles] = useState<Selle[]>([]);
  const [selectedTab, setSelectedTab] = useState<"mictions" | "selles">(
    "mictions"
  );

  // Récupérer les paramètres de l'URL
  const { tab } = useLocalSearchParams();

  // Définir l'onglet initial en fonction du paramètre
  useEffect(() => {
    if (tab === "selles") {
      setSelectedTab("selles");
    } else if (tab === "mictions") {
      setSelectedTab("mictions");
    }
    // Ne pas changer l'onglet si aucun paramètre 'tab' n'est fourni
  }, [tab]);

  // écoute en temps réel des tetees
  useEffect(() => {
    const unsubscribeMictions = ecouterMictions(setMictions);
    return () => unsubscribeMictions();
  }, []);

  // écoute en temps réel des pompages
  useEffect(() => {
    const unsubscribeSelles = ecouterSelles(setSelles);
    return () => unsubscribeSelles();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* BOUTONS DE SÉLECTION */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            selectedTab === "mictions" && styles.tabButtonActive,
          ]}
          onPress={() => setSelectedTab("mictions")}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "mictions" && styles.tabTextActive,
            ]}
          >
            Mictions
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            selectedTab === "selles" && styles.tabButtonActive,
          ]}
          onPress={() => setSelectedTab("selles")}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "selles" && styles.tabTextActive,
            ]}
          >
            Selles
          </Text>
        </TouchableOpacity>
      </View>

      {/* SCROLLVIEW DES CHARTS */}
      <View style={styles.container}>
        {selectedTab === "mictions" ? (
          <MictionsScreen mictions={mictions} />
        ) : (
          <SellesScreen selles={selles} />
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
