import { radius, space } from "@/constants/tokens";
import { ThemedView } from "@/components/themed-view";
import { SkeletonList } from "@/components/ui/Skeleton";
import { getAccentColors } from "@/components/ui/accentColors";
import {
  getNeutralColors,
  itemColors,
  neutralColors,
} from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import { isPlusRouteVisible, SHOW_PREVIEWS } from "@/constants/featureFlags";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { PENDING_QUEUE_WARNING } from "@/services/exportCollector";
import { exportAllEventsCSV } from "@/services/exportService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "expo-router/react-navigation";
import * as Haptics from "expo-haptics";
import { useGuardedNavigation } from "@/hooks/useGuardedNavigation";
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
  /** Couleur d'identité (tokens de catégorie) ; l'icône utilise sa variante lisible. */
  color: string;
  route: string;
  ownerOnly?: boolean;
}

interface Section {
  label: string;
  items: Item[];
}

// Statistiques et outils : neutre (pas une catégorie de saisie).
const STATS_COLOR = neutralColors.textLight;

const SECTIONS: Section[] = [
  {
    label: "Suivi quotidien",
    items: [
      {
        title: "Repas",
        subtitle: "Biberons, tétées et solides",
        icon: "utensils",
        color: eventColors.meal.dark,
        route: "/baby/meals",
      },
      {
        title: "Routines",
        subtitle: "Sommeil, bain et routines rapides",
        icon: "bath",
        color: eventColors.sommeil.dark,
        route: "/baby/routines",
      },
      {
        title: "Couches",
        subtitle: "Mictions et selles",
        icon: { lib: "mci", name: "human-baby-changing-table" },
        color: eventColors.miction.dark,
        route: "/baby/diapers",
      },
      {
        title: "Statistiques",
        subtitle: "Alimentation et expression du lait",
        icon: "chart-line",
        color: STATS_COLOR,
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
        color: eventColors.vaccin.dark,
        route: "/baby/soins",
      },
      {
        title: "Tire-lait",
        subtitle: "Sessions et totaux",
        icon: "pump-medical",
        color: eventColors.pumping.dark,
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
        color: eventColors.croissance.dark,
        route: "/baby/growth",
      },
      {
        // APERÇU TEMPORAIRE (décision produit en attente) — à supprimer.
        title: "Croissance (aperçu fusion)",
        subtitle: "Courbe et mesures sur un seul écran",
        icon: "flask",
        color: eventColors.croissance.dark,
        route: "/baby/croissance-fusion",
      },
      {
        title: "Activités",
        subtitle: "Tummy time, jeux, lecture, promenade...",
        icon: "play-circle",
        color: eventColors.activite.dark,
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
        color: itemColors.photo,
        route: "/baby/gallery",
      },
      {
        title: "Jalons",
        subtitle: "Dents, pas, sourires, mots...",
        icon: "star",
        color: eventColors.jalon.dark,
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
        color: neutralColors.warning,
        route: "/baby/manage-access",
        ownerOnly: true,
      },
    ],
  },
];

export default function PlusScreen() {
  const { push: guardedPush } = useGuardedNavigation();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const navLockRef = useRef(false);
  const statsAccent = getAccentColors(STATS_COLOR, colorScheme);

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
        guardedPush(`${route}?childId=${activeChild.id}&returnTo=plus` as any);
      } else {
        guardedPush(`${route}?returnTo=plus` as any);
      }
    },
    [guardedPush, activeChild?.id],
  );

  const handleExport = useCallback(async () => {
    if (!activeChild?.id || !activeChild?.name || exporting) return;
    setExporting(true);
    try {
      await exportAllEventsCSV(
        activeChild.id,
        activeChild.name,
        firebaseUser?.uid ?? "",
        {
          // Saisies hors ligne en attente : elles ne figureront pas dans le fichier.
          confirmPending: () =>
            new Promise<boolean>((resolve) => {
              Alert.alert(
                "Export incomplet",
                PENDING_QUEUE_WARNING,
                [
                  { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
                  { text: "Exporter quand même", onPress: () => resolve(true) },
                ],
                { cancelable: true, onDismiss: () => resolve(false) },
              );
            }),
        },
      );
    } catch (e: any) {
      Alert.alert(
        "Erreur d'export",
        e?.message || "Impossible d'exporter les données.",
      );
    } finally {
      setExporting(false);
    }
  }, [activeChild?.id, activeChild?.name, exporting, firebaseUser?.uid]);

  const isDark = colorScheme === "dark";

  // Filtrer les sections : retirer les items ownerOnly si pas les droits et
  // les aperçus internes hors drapeau (jamais en build de store), puis
  // exclure les sections vides
  const visibleSections = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        (!item.ownerOnly || permissions.canManageAccess) &&
        isPlusRouteVisible(item.route, SHOW_PREVIEWS),
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
            <Text style={[styles.subtitle, { color: nc.textLight }]}>
              Accès aux écrans détaillés
            </Text>
          </View>

          {permissions.loading && visibleSections.length === 0 ? (
            <SkeletonList rows={4} />
          ) : visibleSections.length === 0 ? (
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
                  style={[styles.sectionLabel, { color: nc.textLight }]}
                  accessibilityRole="header"
                >
                  {section.label}
                </Text>
                <View style={styles.sectionItems}>
                  {section.items.map((item) => {
                    const accent = getAccentColors(item.color, colorScheme);
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
                              backgroundColor: accent.softBg,
                            },
                          ]}
                          importantForAccessibility="no"
                        >
                          {typeof item.icon === "string" ? (
                            <FontAwesome
                              name={item.icon as any}
                              size={18}
                              color={accent.softText}
                            />
                          ) : (
                            <MaterialCommunityIcons
                              name={item.icon.name as any}
                              size={18}
                              color={accent.softText}
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
          {/* Owner-only entries (e.g. access management) appear once permissions load. */}
          {permissions.loading && visibleSections.length > 0 && (
            <SkeletonList rows={1} style={styles.section} />
          )}

          {activeChild && (
            <View style={styles.section}>
              <Text
                style={[styles.sectionLabel, { color: nc.textLight }]}
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
                        backgroundColor: statsAccent.softBg,
                      },
                    ]}
                    importantForAccessibility="no"
                  >
                    {exporting ? (
                      <ActivityIndicator
                        size="small"
                        color={statsAccent.softText}
                      />
                    ) : (
                      <FontAwesome
                        name="file-csv"
                        size={18}
                        color={statsAccent.softText}
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
    paddingBottom: space.xl,
  },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: space.xxs,
    fontSize: 13,
  },
  section: {
    paddingHorizontal: space.lg,
    marginBottom: space.lg,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: space.xs,
    marginLeft: space.xxs,
  },
  sectionItems: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    shadowColor: neutralColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
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
    gap: space.sm,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: space.lg,
  },
});
