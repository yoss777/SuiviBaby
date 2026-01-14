import PompagesChart from "@/components/suivibaby/PompagesChart";
import TeteesChart from "@/components/suivibaby/TeteesChart";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterBiberonsHybrid as ecouterBiberons,
  ecouterPompagesHybrid as ecouterPompages,
  ecouterTeteesHybrid as ecouterTetees,
} from "@/migration/eventsHybridService";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function StatsScreen() {
  const { activeChild } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  const [tetees, setTetees] = useState<any[]>([]);
  const [pompages, setPompages] = useState<any[]>([]);
  const [teteesLoaded, setTeteesLoaded] = useState(false);
  const [biberonsLoaded, setBiberonsLoaded] = useState(false);
  const [pompagesLoaded, setPompagesLoaded] = useState(false);
  const [teteesEmptyDelayDone, setTeteesEmptyDelayDone] = useState(false);
  const [pompagesEmptyDelayDone, setPompagesEmptyDelayDone] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"tetees" | "pompages">(
    "tetees"
  );

  // Récupérer les paramètres de l'URL
  const { tab } = useLocalSearchParams();

  // Définir l'onglet initial en fonction du paramètre
  useEffect(() => {
    if (tab === "pompages") {
      setSelectedTab("pompages");
    } else {
      setSelectedTab("tetees"); // Par défaut, ou si tab === 'tetees'
    }
  }, [tab]);

  // écoute en temps réel des tetees ET biberons
  useEffect(() => {
    if (!activeChild?.id) return;

    let teteesData: any[] = [];
    let biberonsData: any[] = [];

    const mergeTeteesAndBiberons = () => {
      // Merger les deux listes et trier par date
      const merged = [...teteesData, ...biberonsData].sort(
        (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
      );
      setTetees(merged);
    };

    const unsubscribeTetees = ecouterTetees(
      activeChild.id,
      (tetees) => {
        teteesData = tetees;
        setTeteesLoaded(true);
        mergeTeteesAndBiberons();
      },
      { waitForServer: true }
    );

    const unsubscribeBiberons = ecouterBiberons(
      activeChild.id,
      (biberons) => {
        biberonsData = biberons;
        setBiberonsLoaded(true);
        mergeTeteesAndBiberons();
      },
      { waitForServer: true }
    );

    return () => {
      unsubscribeTetees();
      unsubscribeBiberons();
    };
  }, [activeChild]);

  // écoute en temps réel des pompages
  useEffect(() => {
    if (!activeChild?.id) return;
    const unsubscribePompages = ecouterPompages(
      activeChild.id,
      (data) => {
        setPompages(data);
        setPompagesLoaded(true);
      },
      { waitForServer: true }
    );
    return () => unsubscribePompages();
  }, [activeChild]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setTetees([]);
    setPompages([]);
    setTeteesLoaded(false);
    setBiberonsLoaded(false);
    setPompagesLoaded(false);
    setTeteesEmptyDelayDone(false);
    setPompagesEmptyDelayDone(false);
  }, [activeChild?.id]);

  const isTeteesLoading = !(teteesLoaded && biberonsLoaded);
  const isPompagesLoading = !pompagesLoaded;

  useEffect(() => {
    if (isTeteesLoading) {
      setTeteesEmptyDelayDone(false);
      return;
    }
    if (tetees.length > 0) {
      setTeteesEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setTeteesEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [isTeteesLoading, tetees.length]);

  useEffect(() => {
    if (isPompagesLoading) {
      setPompagesEmptyDelayDone(false);
      return;
    }
    if (pompages.length > 0) {
      setPompagesEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setPompagesEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [isPompagesLoading, pompages.length]);

  return (
    <View style={{ flex: 1 }}>
      {/* BOUTONS DE SÉLECTION */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            selectedTab === "tetees" && styles.tabButtonActive,
          ]}
          onPress={() => setSelectedTab("tetees")}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "tetees" && styles.tabTextActive,
            ]}
          >
            Tétées
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            selectedTab === "pompages" && styles.tabButtonActive,
          ]}
          onPress={() => setSelectedTab("pompages")}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "pompages" && styles.tabTextActive,
            ]}
          >
            Pompages
          </Text>
        </TouchableOpacity>
      </View>

      {/* SCROLLVIEW DES CHARTS */}
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {selectedTab === "tetees" ? (
          isTeteesLoading || !teteesEmptyDelayDone ? (
            <View style={styles.loaderContainer}>
              <IconPulseDots color={Colors[colorScheme].tint} />
            </View>
          ) : (
            <TeteesChart tetees={tetees} />
          )
        ) : isPompagesLoading || !pompagesEmptyDelayDone ? (
          <View style={styles.loaderContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
          </View>
        ) : (
          <PompagesChart pompages={pompages} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: "row",
    justifyContent: "center",
    // paddingTop: 10,
    gap: 10,
    backgroundColor: "#f8f9fa",
    // borderWidth:1,
    paddingTop:16,
    paddingBottom:12,
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
  scrollContainer: {
    // paddingBottom: 20,
    alignItems: "center",
  },
  loaderContainer: {
    paddingTop: 32,
  },
});
