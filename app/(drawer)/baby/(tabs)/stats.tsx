import PompagesChart from "@/components/suivibaby/PompagesChart";
import RepasChart from "@/components/suivibaby/RepasChart";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { Colors } from "@/constants/theme";
import { getChartColors, getNeutralColors } from "@/constants/dashboardColors";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterBiberonsHybrid as ecouterBiberons,
  ecouterPompagesHybrid as ecouterPompages,
  ecouterSolidesHybrid as ecouterSolides,
  ecouterTeteesHybrid as ecouterTetees,
} from "@/migration/eventsHybridService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useHeaderLeft } from "../../_layout";

export default function StatsScreen() {
  const { activeChild } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  const nc = useMemo(() => getNeutralColors(colorScheme), [colorScheme]);
  const chartColors = useMemo(() => getChartColors(colorScheme), [colorScheme]);
  const { width: windowWidth } = useWindowDimensions();
  const screenWidth = windowWidth - 40;
  const { setHeaderLeft } = useHeaderLeft();
  const [tetees, setTetees] = useState<any[]>([]);
  const [pompages, setPompages] = useState<any[]>([]);
  const [teteesLoaded, setTeteesLoaded] = useState(false);
  const [biberonsLoaded, setBiberonsLoaded] = useState(false);
  const [solidesLoaded, setSolidesLoaded] = useState(false);
  const [pompagesLoaded, setPompagesLoaded] = useState(false);
  const [teteesEmptyDelayDone, setTeteesEmptyDelayDone] = useState(false);
  const [pompagesEmptyDelayDone, setPompagesEmptyDelayDone] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"tetees" | "pompages">(
    "tetees",
  );
  const [tabWidth, setTabWidth] = useState(0);
  const underlineX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Récupérer les paramètres de l'URL
  const { tab, returnTo } = useLocalSearchParams();
  const returnTarget = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const rawTab = Array.isArray(tab) ? tab[0] : tab;

  // Mapper le paramètre tab vers l'onglet stats + filtre RepasChart
  const initialTypeFilter = useMemo(
    () =>
      rawTab === "biberons"
        ? "biberons"
        : rawTab === "tetees"
          ? "seins"
          : rawTab === "solides"
            ? "solides"
            : undefined,
    [rawTab],
  );

  // Définir l'onglet initial en fonction du paramètre
  useEffect(() => {
    if (rawTab === "pompages") {
      setSelectedTab("pompages");
    } else {
      setSelectedTab("tetees");
    }
  }, [rawTab]);

  useEffect(() => {
    if (tabWidth === 0) return;
    const target = selectedTab === "pompages" ? tabWidth : 0;
    Animated.timing(underlineX, {
      toValue: target,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [selectedTab, tabWidth, underlineX]);

  const handleTabChange = (tab: "tetees" | "pompages") => {
    if (tab === selectedTab) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fadeAnim.stopAnimation(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(() => {
        setSelectedTab(tab);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }).start();
      });
    });
  };

  // Factored navigation handler
  const navigateReturn = useCallback(() => {
    if (returnTarget === "home") {
      router.replace("/baby/home");
      return true;
    }
    if (returnTarget === "chrono") {
      router.replace("/baby/chrono");
      return true;
    }
    if (returnTarget === "journal") {
      router.replace("/baby/chrono");
      return true;
    }
    router.replace("/baby/plus");
    return true;
  }, [returnTarget]);

  useFocusEffect(
    useCallback(() => {
      if (!returnTarget) {
        setHeaderLeft(null, "stats");
        return () => {
          setHeaderLeft(null, "stats");
        };
      }
      const backButton = (
        <HeaderBackButton
          onPress={() => navigateReturn()}
          tintColor={Colors[colorScheme].text}
        />
      );
      setHeaderLeft(backButton, "stats");

      return () => {
        setHeaderLeft(null, "stats");
      };
    }, [colorScheme, returnTarget, setHeaderLeft, navigateReturn]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!returnTarget) return;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        navigateReturn,
      );
      return () => subscription.remove();
    }, [returnTarget, navigateReturn]),
  );

  // Error handler for Firestore listeners
  const handleListenerError = useCallback(() => {
    setLoadError("Impossible de charger les données");
    setTeteesLoaded(true);
    setBiberonsLoaded(true);
    setSolidesLoaded(true);
    setPompagesLoaded(true);
  }, []);

  // écoute en temps réel des tetees, biberons ET solides
  useEffect(() => {
    if (!activeChild?.id) return;

    let teteesData: any[] = [];
    let biberonsData: any[] = [];
    let solidesData: any[] = [];

    const mergeRepas = () => {
      const merged = [...teteesData, ...biberonsData, ...solidesData].sort(
        (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0),
      );
      setTetees(merged);
    };

    setLoadError(null);

    const unsubscribeTetees = ecouterTetees(
      activeChild.id,
      (tetees) => {
        teteesData = tetees;
        setTeteesLoaded(true);
        mergeRepas();
      },
      { waitForServer: true },
      handleListenerError,
    );

    const unsubscribeBiberons = ecouterBiberons(
      activeChild.id,
      (biberons) => {
        biberonsData = biberons;
        setBiberonsLoaded(true);
        mergeRepas();
      },
      { waitForServer: true },
      handleListenerError,
    );

    const unsubscribeSolides = ecouterSolides(
      activeChild.id,
      (solides) => {
        solidesData = solides;
        setSolidesLoaded(true);
        mergeRepas();
      },
      { waitForServer: true },
      handleListenerError,
    );

    return () => {
      unsubscribeTetees();
      unsubscribeBiberons();
      unsubscribeSolides();
    };
  }, [activeChild, refreshKey, handleListenerError]);

  // écoute en temps réel des pompages
  useEffect(() => {
    if (!activeChild?.id) return;
    const unsubscribePompages = ecouterPompages(
      activeChild.id,
      (data) => {
        setPompages(data);
        setPompagesLoaded(true);
      },
      { waitForServer: true },
      handleListenerError,
    );
    return () => unsubscribePompages();
  }, [activeChild, refreshKey, handleListenerError]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setTetees([]);
    setPompages([]);
    setTeteesLoaded(false);
    setBiberonsLoaded(false);
    setSolidesLoaded(false);
    setPompagesLoaded(false);
    setTeteesEmptyDelayDone(false);
    setPompagesEmptyDelayDone(false);
    setLoadError(null);
  }, [activeChild?.id]);

  const isTeteesLoading = !(teteesLoaded && biberonsLoaded && solidesLoaded);
  const isPompagesLoading = !pompagesLoaded;

  // End refresh spinner when ALL data arrives (tab-agnostic to avoid stuck spinner)
  useEffect(() => {
    if (!isRefreshing) return;
    if (!isTeteesLoading && !isPompagesLoading) {
      setIsRefreshing(false);
    }
  }, [isRefreshing, isTeteesLoading, isPompagesLoading]);

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

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTeteesLoaded(false);
    setBiberonsLoaded(false);
    setSolidesLoaded(false);
    setPompagesLoaded(false);
    setLoadError(null);
    setRefreshKey((k) => k + 1);
  }, []);

  // Stable animated style ref (fadeAnim never changes identity)
  const fadeStyle = useMemo(
    () => ({ opacity: fadeAnim, flex: 1, width: "100%" as const }),
    [fadeAnim],
  );

  // Refresh tint color: use chart accent instead of generic tint
  const refreshTintColor =
    selectedTab === "tetees"
      ? chartColors.tetees.blue
      : chartColors.pompages.green;

  return (
    <View style={[styles.container, { backgroundColor: nc.background }]}>
      {/* BOUTONS DE SÉLECTION */}
      <View
        style={styles.tabContainer}
        onLayout={(event) => {
          const width = Math.floor(event.nativeEvent.layout.width / 2);
          if (width !== tabWidth) setTabWidth(width);
        }}
        accessibilityRole="tablist"
      >
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => handleTabChange("tetees")}
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedTab === "tetees" }}
          accessibilityLabel="Onglet Repas"
          accessibilityHint="Afficher les statistiques des repas"
        >
          <Text
            style={[
              styles.tabText,
              { color: nc.textLight },
              selectedTab === "tetees" && {
                color: Colors[colorScheme].tint,
              },
            ]}
          >
            Repas
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => handleTabChange("pompages")}
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedTab === "pompages" }}
          accessibilityLabel="Onglet Pompages"
          accessibilityHint="Afficher les statistiques des pompages"
        >
          <Text
            style={[
              styles.tabText,
              { color: nc.textLight },
              selectedTab === "pompages" && {
                color: Colors[colorScheme].tint,
              },
            ]}
          >
            Pompages
          </Text>
        </TouchableOpacity>
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabUnderline,
              {
                width: tabWidth,
                transform: [{ translateX: underlineX }],
                backgroundColor: Colors[colorScheme].tint,
              },
            ]}
          />
        )}
      </View>

      {/* SCROLLVIEW DES CHARTS */}
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={refreshTintColor}
          />
        }
      >
        <Animated.View style={fadeStyle}>
          {loadError ? (
            <View style={styles.errorContainer}>
              <FontAwesome name="wifi" size={40} color={nc.textMuted} />
              <Text style={[styles.errorTitle, { color: nc.textNormal }]}>
                {loadError}
              </Text>
              <Text style={[styles.errorSubtitle, { color: nc.textLight }]}>
                Vérifiez votre connexion internet
              </Text>
              <TouchableOpacity
                style={[
                  styles.retryButton,
                  { backgroundColor: refreshTintColor },
                ]}
                onPress={handleRefresh}
                accessibilityRole="button"
                accessibilityLabel="Réessayer le chargement"
              >
                <FontAwesome
                  name="arrows-rotate"
                  size={14}
                  color="#ffffff"
                />
                <Text style={styles.retryText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.tabPanel, selectedTab !== "tetees" && styles.hiddenTab]}>
                {isTeteesLoading || !teteesEmptyDelayDone ? (
                  <View style={styles.loaderContainer}>
                    <IconPulseDots color={chartColors.tetees.blue} />
                  </View>
                ) : (
                  <RepasChart
                    tetees={tetees}
                    initialTypeFilter={initialTypeFilter}
                    colorScheme={colorScheme}
                    screenWidth={screenWidth}
                  />
                )}
              </View>
              <View style={[styles.tabPanel, selectedTab !== "pompages" && styles.hiddenTab]}>
                {isPompagesLoading || !pompagesEmptyDelayDone ? (
                  <View style={styles.loaderContainer}>
                    <IconPulseDots color={chartColors.pompages.green} />
                  </View>
                ) : (
                  <PompagesChart
                    pompages={pompages}
                    colorScheme={colorScheme}
                    screenWidth={screenWidth}
                  />
                )}
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 10,
    position: "relative",
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    flex: 1,
    alignItems: "center",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 4,
    left: 0,
    height: 2,
    borderRadius: 2,
  },
  scrollContainer: {
    flexGrow: 1,
    alignItems: "center",
  },
  loaderContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 8,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginTop: 12,
    textAlign: "center",
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  tabPanel: {
    flex: 1,
    width: "100%",
  },
  hiddenTab: {
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
  },
});
