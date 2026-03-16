import PompagesChart from "@/components/suivibaby/PompagesChart";
import RepasChart from "@/components/suivibaby/RepasChart";
import SommeilChart from "@/components/suivibaby/SommeilChart";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { Colors } from "@/constants/theme";
import { getChartColors, getNeutralColors } from "@/constants/dashboardColors";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterBiberonsHybrid as ecouterBiberons,
  ecouterPompagesHybrid as ecouterPompages,
  ecouterSolidesHybrid as ecouterSolides,
  ecouterSommeilsHybrid as ecouterSommeils,
  ecouterTeteesHybrid as ecouterTetees,
} from "@/migration/eventsHybridService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { router, useLocalSearchParams } from "expo-router";
import PagerView from "react-native-pager-view";
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

type TabKey = "tetees" | "pompages" | "sommeil";

const TAB_CONFIG: { key: TabKey; icon: string; label: string; a11yLabel: string; a11yHint: string }[] = [
  { key: "tetees", icon: "utensils", label: "Repas", a11yLabel: "Onglet Repas", a11yHint: "Afficher les statistiques des repas" },
  { key: "pompages", icon: "pump-medical", label: "Pompages", a11yLabel: "Onglet Pompages", a11yHint: "Afficher les statistiques des pompages" },
  { key: "sommeil", icon: "bed", label: "Sommeil", a11yLabel: "Onglet Sommeil", a11yHint: "Afficher les statistiques du sommeil" },
];

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
  const [sommeils, setSommeils] = useState<any[]>([]);
  const [teteesLoaded, setTeteesLoaded] = useState(false);
  const [biberonsLoaded, setBiberonsLoaded] = useState(false);
  const [solidesLoaded, setSolidesLoaded] = useState(false);
  const [pompagesLoaded, setPompagesLoaded] = useState(false);
  const [sommeilLoaded, setSommeilLoaded] = useState(false);
  const [teteesEmptyDelayDone, setTeteesEmptyDelayDone] = useState(false);
  const [pompagesEmptyDelayDone, setPompagesEmptyDelayDone] = useState(false);
  const [sommeilEmptyDelayDone, setSommeilEmptyDelayDone] = useState(false);
  const [selectedTab, setSelectedTab] = useState<TabKey>("tetees");
  const [tabWidth, setTabWidth] = useState(0);
  const underlineX = useRef(new Animated.Value(0)).current;
  const pagerRef = useRef<PagerView>(null);
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
      pagerRef.current?.setPageWithoutAnimation(1);
    } else if (rawTab === "sommeil") {
      setSelectedTab("sommeil");
      pagerRef.current?.setPageWithoutAnimation(2);
    } else {
      setSelectedTab("tetees");
      pagerRef.current?.setPageWithoutAnimation(0);
    }
  }, [rawTab]);

  useEffect(() => {
    if (tabWidth === 0) return;
    const tabIndex = TAB_CONFIG.findIndex((t) => t.key === selectedTab);
    const target = tabIndex * tabWidth;
    Animated.timing(underlineX, {
      toValue: target,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [selectedTab, tabWidth, underlineX]);

  const handleTabChange = (tab: TabKey) => {
    if (tab === selectedTab) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const tabIndex = TAB_CONFIG.findIndex((t) => t.key === tab);
    pagerRef.current?.setPage(tabIndex);
    setSelectedTab(tab);
  };

  const handlePageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    const index = e.nativeEvent.position;
    const tab = TAB_CONFIG[index]?.key;
    if (tab && tab !== selectedTab) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedTab(tab);
    }
  }, [selectedTab]);

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
    setSommeilLoaded(true);
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

  // écoute en temps réel du sommeil
  useEffect(() => {
    if (!activeChild?.id) return;
    const unsubscribeSommeils = ecouterSommeils(
      activeChild.id,
      (data) => {
        setSommeils(data);
        setSommeilLoaded(true);
      },
      { waitForServer: true },
      handleListenerError,
    );
    return () => unsubscribeSommeils();
  }, [activeChild, refreshKey, handleListenerError]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setTetees([]);
    setPompages([]);
    setSommeils([]);
    setTeteesLoaded(false);
    setBiberonsLoaded(false);
    setSolidesLoaded(false);
    setPompagesLoaded(false);
    setSommeilLoaded(false);
    setTeteesEmptyDelayDone(false);
    setPompagesEmptyDelayDone(false);
    setSommeilEmptyDelayDone(false);
    setLoadError(null);
  }, [activeChild?.id]);

  const isTeteesLoading = !(teteesLoaded && biberonsLoaded && solidesLoaded);
  const isPompagesLoading = !pompagesLoaded;
  const isSommeilLoading = !sommeilLoaded;

  // End refresh spinner when ALL data arrives (tab-agnostic to avoid stuck spinner)
  useEffect(() => {
    if (!isRefreshing) return;
    if (!isTeteesLoading && !isPompagesLoading && !isSommeilLoading) {
      setIsRefreshing(false);
    }
  }, [isRefreshing, isTeteesLoading, isPompagesLoading, isSommeilLoading]);

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

  useEffect(() => {
    if (isSommeilLoading) {
      setSommeilEmptyDelayDone(false);
      return;
    }
    if (sommeils.length > 0) {
      setSommeilEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setSommeilEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [isSommeilLoading, sommeils.length]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTeteesLoaded(false);
    setBiberonsLoaded(false);
    setSolidesLoaded(false);
    setPompagesLoaded(false);
    setSommeilLoaded(false);
    setLoadError(null);
    setRefreshKey((k) => k + 1);
  }, []);

  // PDF Export
  const handleExportPDF = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const name = activeChild?.name || "Bébé";
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    const html = `
      <html>
      <head><meta charset="utf-8"><style>
        body { font-family: -apple-system, sans-serif; padding: 32px; color: #1e2a36; }
        h1 { font-size: 22px; color: #6366f1; margin-bottom: 4px; }
        h2 { font-size: 16px; color: #6b7280; margin-top: 24px; }
        .date { font-size: 13px; color: #9ca3af; margin-bottom: 20px; }
        .grid { display: flex; gap: 12px; margin-top: 12px; }
        .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; text-align: center; }
        .card-value { font-size: 28px; font-weight: 700; }
        .card-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
        .blue { color: #2f80ed; }
        .green { color: #2e7d32; }
        .purple { color: #7c3aed; }
        .footer { margin-top: 32px; font-size: 11px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px; }
      </style></head>
      <body>
        <h1>Rapport hebdomadaire — ${name}</h1>
        <div class="date">${dateStr}</div>

        <h2>Résumé</h2>
        <div class="grid">
          <div class="card">
            <div class="card-value blue">${tetees.length}</div>
            <div class="card-label">Repas enregistrés</div>
          </div>
          <div class="card">
            <div class="card-value green">${pompages.length}</div>
            <div class="card-label">Pompages</div>
          </div>
          <div class="card">
            <div class="card-value purple">${sommeils.length}</div>
            <div class="card-label">Sommeils</div>
          </div>
        </div>

        <h2>Détail repas</h2>
        <p>${tetees.filter((t: any) => t.type === "tetee" || !t.type).length} tétées, ${tetees.filter((t: any) => t.type === "biberon").length} biberons, ${tetees.filter((t: any) => t.type === "solide").length} solides</p>

        <h2>Sommeil</h2>
        <p>${sommeils.filter((s: any) => !s.isNap).length} nuits, ${sommeils.filter((s: any) => s.isNap).length} siestes</p>

        <div class="footer">Généré par Samaye · ${dateStr}</div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    } catch (_) {
      // User cancelled sharing
    }
  }, [activeChild?.name, tetees, pompages, sommeils]);

  // Refresh tint color: use chart accent per tab
  const refreshTintColor =
    selectedTab === "tetees"
      ? chartColors.tetees.blue
      : selectedTab === "pompages"
        ? chartColors.pompages.green
        : chartColors.sommeil.purple;

  return (
    <View style={[styles.container, { backgroundColor: nc.background }]}>
      {/* BOUTONS DE SÉLECTION (icônes) */}
      <View
        style={styles.tabContainer}
        onLayout={(event) => {
          const width = Math.floor(event.nativeEvent.layout.width / TAB_CONFIG.length);
          if (width !== tabWidth) setTabWidth(width);
        }}
        accessibilityRole="tablist"
      >
        {TAB_CONFIG.map((tabItem) => {
          const isActive = selectedTab === tabItem.key;
          const activeColor =
            tabItem.key === "tetees"
              ? chartColors.tetees.blue
              : tabItem.key === "pompages"
                ? chartColors.pompages.green
                : chartColors.sommeil.purple;
          return (
            <TouchableOpacity
              key={tabItem.key}
              style={styles.tabButton}
              onPress={() => handleTabChange(tabItem.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tabItem.a11yLabel}
              accessibilityHint={tabItem.a11yHint}
            >
              <FontAwesome
                name={tabItem.icon}
                size={22}
                color={isActive ? activeColor : nc.textMuted}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: nc.textMuted },
                  isActive && { color: activeColor, fontWeight: "700" },
                ]}
              >
                {tabItem.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabUnderline,
              {
                width: tabWidth,
                transform: [{ translateX: underlineX }],
                backgroundColor:
                  selectedTab === "tetees"
                    ? chartColors.tetees.blue
                    : selectedTab === "pompages"
                      ? chartColors.pompages.green
                      : chartColors.sommeil.purple,
              },
            ]}
          />
        )}
      </View>

      {/* RESUME CARDS + EXPORT */}
      {!loadError && !isTeteesLoading && !isPompagesLoading && !isSommeilLoading && (
        <View style={styles.resumeRow}>
          <TouchableOpacity
            style={[styles.resumeCard, { borderColor: chartColors.tetees.blue + "40" }]}
            onPress={() => handleTabChange("tetees")}
            accessibilityLabel="Résumé repas, appuyer pour voir les détails"
          >
            <FontAwesome name="utensils" size={14} color={chartColors.tetees.blue} />
            <Text style={[styles.resumeValue, { color: chartColors.tetees.blue }]}>
              {tetees.length}
            </Text>
            <Text style={[styles.resumeLabel, { color: nc.textMuted }]}>repas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.resumeCard, { borderColor: chartColors.pompages.green + "40" }]}
            onPress={() => handleTabChange("pompages")}
            accessibilityLabel="Résumé pompages, appuyer pour voir les détails"
          >
            <FontAwesome name="pump-medical" size={14} color={chartColors.pompages.green} />
            <Text style={[styles.resumeValue, { color: chartColors.pompages.green }]}>
              {pompages.length}
            </Text>
            <Text style={[styles.resumeLabel, { color: nc.textMuted }]}>pompages</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.resumeCard, { borderColor: chartColors.sommeil.purple + "40" }]}
            onPress={() => handleTabChange("sommeil")}
            accessibilityLabel="Résumé sommeil, appuyer pour voir les détails"
          >
            <FontAwesome name="bed" size={14} color={chartColors.sommeil.purple} />
            <Text style={[styles.resumeValue, { color: chartColors.sommeil.purple }]}>
              {sommeils.length}
            </Text>
            <Text style={[styles.resumeLabel, { color: nc.textMuted }]}>sommeils</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportButton, { borderColor: nc.border }]}
            onPress={handleExportPDF}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Exporter le rapport en PDF"
          >
            <FontAwesome name="file-pdf" size={16} color={nc.textMuted} />
          </TouchableOpacity>
        </View>
      )}

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
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Réessayer le chargement"
          >
            <FontAwesome
              name="arrows-rotate"
              size={14}
              color={nc.white}
            />
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageSelected={handlePageSelected}
          overdrag
        >
          <ScrollView
            key="repas"
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={chartColors.tetees.blue}
              />
            }
          >
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
          </ScrollView>
          <ScrollView
            key="pompages"
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={chartColors.pompages.green}
              />
            }
          >
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
          </ScrollView>
          <ScrollView
            key="sommeil"
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={chartColors.sommeil.purple}
              />
            }
          >
            {isSommeilLoading || !sommeilEmptyDelayDone ? (
              <View style={styles.loaderContainer}>
                <IconPulseDots color={chartColors.sommeil.purple} />
              </View>
            ) : (
              <SommeilChart
                sommeils={sommeils}
                repas={tetees}
                babyName={activeChild?.name}
                colorScheme={colorScheme}
                screenWidth={screenWidth}
              />
            )}
          </ScrollView>
        </PagerView>
      )}

      {/* Page dots */}
      <View style={styles.dotsContainer}>
        {TAB_CONFIG.map((tabItem, i) => {
          const isActive = selectedTab === tabItem.key;
          const dotColor = isActive
            ? (tabItem.key === "tetees"
              ? chartColors.tetees.blue
              : tabItem.key === "pompages"
                ? chartColors.pompages.green
                : chartColors.sommeil.purple)
            : nc.textMuted;
          return (
            <View
              key={tabItem.key}
              style={[
                styles.dot,
                { backgroundColor: dotColor },
                isActive && styles.dotActive,
              ]}
            />
          );
        })}
      </View>
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
    paddingVertical: 8,
    marginBottom: 10,
    position: "relative",
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: 2,
  },
  scrollContainer: {
    flexGrow: 1,
    alignItems: "center",
    paddingBottom: 80,
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
  resumeRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  resumeCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  resumeValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  resumeLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  exportButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  pager: {
    flex: 1,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.4,
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 1,
  },
});
