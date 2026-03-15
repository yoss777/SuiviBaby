import { ThemedView } from "@/components/themed-view";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { exportAllEventsCSV } from "@/services/exportService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ItemIcon = string | { lib: "mci"; name: string };

interface Item {
  title: string;
  subtitle: string;
  icon: ItemIcon;
  color: string;
  darkColor?: string;
  route: string;
  ownerOnly?: boolean;
}

interface Section {
  label: string;
  items: Item[];
}

const SECTIONS: Section[] = [
  {
    label: "Suivi quotidien",
    items: [
      {
        title: "Repas",
        subtitle: "Biberons, tétées et solides",
        icon: "utensils",
        color: "#4A90E2",
        route: "/baby/meals",
      },
      {
        title: "Routines",
        subtitle: "Sommeil, bain et routines rapides",
        icon: "bath",
        color: "#8b5cf6",
        route: "/baby/routines",
      },
      {
        title: "Couches",
        subtitle: "Mictions et selles",
        icon: { lib: "mci", name: "human-baby-changing-table" },
        color: "#17a2b8",
        route: "/baby/diapers",
      },
      {
        title: "Statistiques",
        subtitle: "Alimentation et expression du lait",
        icon: "chart-line",
        color: "#607D8B",
        darkColor: "#90A4AE",
        route: "/baby/stats",
      },
    ],
  },
  {
    label: "Santé & bien-être",
    items: [
      {
        title: "Santé",
        subtitle: "Température, symptômes, médicaments, vaccins",
        icon: "prescription-bottle",
        color: "#9C27B0",
        route: "/baby/soins",
      },
      {
        title: "Tire-lait",
        subtitle: "Sessions et totaux",
        icon: "pump-medical",
        color: "#28a745",
        route: "/baby/pumping",
      },
    ],
  },
  {
    label: "Développement",
    items: [
      {
        title: "Croissance",
        subtitle: "Poids, taille et tour de tête",
        icon: "seedling",
        color: "#8BCF9B",
        darkColor: "#A8E6B8",
        route: "/baby/growth",
      },
      {
        title: "Activités",
        subtitle: "Tummy time, jeux, lecture, promenade...",
        icon: "play-circle",
        color: "#10b981",
        route: "/baby/activities",
      },
    ],
  },
  {
    label: "Souvenirs",
    items: [
      {
        title: "Galerie",
        subtitle: "Photos et moments capturés",
        icon: "images",
        color: "#f472b6",
        route: "/baby/gallery",
      },
      {
        title: "Jalons",
        subtitle: "Dents, pas, sourires, mots...",
        icon: "star",
        color: "#ec4899",
        route: "/baby/milestones",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "Gestion des accès",
        subtitle: "Gérer les permissions des parents",
        icon: "user-gear",
        color: "#f59e0b",
        route: "/baby/manage-access",
        ownerOnly: true,
      },
    ],
  },
];

export default function PlusScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const navLockRef = useRef(false);
  const iconBgOpacity = colorScheme === "dark" ? "26" : "1A";

  // Récupérer l'enfant actif et les permissions
  const { activeChild } = useBaby();
  const { firebaseUser } = useAuth();
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      navLockRef.current = false;
    }, []),
  );

  const handleNavigate = useCallback(
    (route: string) => {
      if (navLockRef.current) {
        return;
      }

      navLockRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Ajouter returnTo=plus pour afficher le back arrow + childId si manage-access
      if (route === "/baby/manage-access" && activeChild?.id) {
        router.push(`${route}?childId=${activeChild.id}&returnTo=plus` as any);
      } else {
        router.push(`${route}?returnTo=plus` as any);
      }
    },
    [activeChild?.id],
  );

  const handleExport = useCallback(async () => {
    if (!activeChild?.id || !activeChild?.name || exporting) return;
    setExporting(true);
    try {
      await exportAllEventsCSV(activeChild.id, activeChild.name);
    } catch (e: any) {
      Alert.alert(
        "Erreur d'export",
        e?.message || "Impossible d'exporter les données.",
      );
    } finally {
      setExporting(false);
    }
  }, [activeChild?.id, activeChild?.name, exporting]);

  const isDark = colorScheme === "dark";

  // Filtrer les sections : retirer les items ownerOnly si pas les droits,
  // puis exclure les sections vides
  const visibleSections = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.ownerOnly || permissions.canManageAccess,
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <ThemedView style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: nc.textStrong }]}>Plus</Text>
            <Text style={[styles.subtitle, { color: nc.textMuted }]}>
              Accès aux écrans détaillés
            </Text>
          </View>

          {visibleSections.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome name="lock" size={24} color={nc.textMuted} />
              <Text style={[styles.emptyText, { color: nc.textLight }]}>
                Aucun écran disponible avec vos permissions actuelles
              </Text>
            </View>
          ) : (
            visibleSections.map((section) => (
              <View key={section.label} style={styles.section}>
                <Text
                  style={[styles.sectionLabel, { color: nc.textMuted }]}
                  accessibilityRole="header"
                >
                  {section.label}
                </Text>
                <View style={styles.sectionItems}>
                  {section.items.map((item) => {
                    const itemColor =
                      isDark && item.darkColor ? item.darkColor : item.color;
                    return (
                      <TouchableOpacity
                        key={item.title}
                        style={[
                          styles.row,
                          {
                            backgroundColor: nc.backgroundCard,
                            borderColor: nc.border,
                            shadowOpacity: isDark ? 0 : 0.04,
                            elevation: isDark ? 0 : 1,
                          },
                        ]}
                        onPress={() => handleNavigate(item.route)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.title} — ${item.subtitle}`}
                      >
                        <View
                          style={[
                            styles.iconWrap,
                            {
                              backgroundColor: `${itemColor}${iconBgOpacity}`,
                            },
                          ]}
                          importantForAccessibility="no"
                        >
                          {typeof item.icon === "string" ? (
                            <FontAwesome
                              name={item.icon as any}
                              size={18}
                              color={itemColor}
                            />
                          ) : (
                            <MaterialCommunityIcons
                              name={item.icon.name as any}
                              size={18}
                              color={itemColor}
                            />
                          )}
                        </View>
                        <View style={styles.textBlock}>
                          <Text
                            style={[styles.rowTitle, { color: nc.textStrong }]}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={[
                              styles.rowSubtitle,
                              { color: nc.textLight },
                            ]}
                          >
                            {item.subtitle}
                          </Text>
                        </View>
                        <FontAwesome
                          name="chevron-right"
                          size={14}
                          color={nc.textMuted}
                          importantForAccessibility="no"
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}

          {activeChild && (
            <View style={styles.section}>
              <Text
                style={[styles.sectionLabel, { color: nc.textMuted }]}
                accessibilityRole="header"
              >
                Outils
              </Text>
              <View style={styles.sectionItems}>
                <TouchableOpacity
                  style={[
                    styles.row,
                    {
                      backgroundColor: nc.backgroundCard,
                      borderColor: nc.border,
                      shadowOpacity: isDark ? 0 : 0.04,
                      elevation: isDark ? 0 : 1,
                    },
                  ]}
                  onPress={handleExport}
                  activeOpacity={0.7}
                  disabled={exporting}
                  accessibilityRole="button"
                  accessibilityLabel="Exporter les données en CSV"
                >
                  <View
                    style={[
                      styles.iconWrap,
                      {
                        backgroundColor: `#607D8B${iconBgOpacity}`,
                      },
                    ]}
                    importantForAccessibility="no"
                  >
                    {exporting ? (
                      <ActivityIndicator
                        size="small"
                        color={isDark ? "#90A4AE" : "#607D8B"}
                      />
                    ) : (
                      <FontAwesome
                        name="file-csv"
                        size={18}
                        color={isDark ? "#90A4AE" : "#607D8B"}
                      />
                    )}
                  </View>
                  <View style={styles.textBlock}>
                    <Text style={[styles.rowTitle, { color: nc.textStrong }]}>
                      Exporter les données
                    </Text>
                    <Text style={[styles.rowSubtitle, { color: nc.textLight }]}>
                      {exporting
                        ? "Export en cours..."
                        : "Télécharger un fichier CSV"}
                    </Text>
                  </View>
                  {!exporting && (
                    <FontAwesome
                      name="download"
                      size={14}
                      color={nc.textMuted}
                      importantForAccessibility="no"
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionItems: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
