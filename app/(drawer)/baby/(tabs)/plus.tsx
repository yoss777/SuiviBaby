import { ThemedView } from "@/components/themed-view";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ITEMS = [
  {
    title: "Gestion des accès",
    subtitle: "Gérer les permissions des parents",
    icon: "user-gear",
    color: "#f59e0b",
    route: "/baby/manage-access",
    ownerOnly: true,
  },
  {
    title: "Statistiques",
    subtitle: "Alimentation et expression du lait",
    icon: "chart-line",
    color: "#607D8B",
    darkColor: "#90A4AE",
    route: "/baby/stats",
  },
  {
    title: "Croissance",
    subtitle: "Poids, taille et tour de tête",
    icon: "seedling",
    color: "#8BCF9B",
    darkColor: "#A8E6B8",
    route: "/baby/growth",
  },
  {
    title: "Repas",
    subtitle: "Biberons et tétées",
    icon: "utensils",
    color: "#4A90E2",
    route: "/baby/meals",
  },
  {
    title: "Tire-lait",
    subtitle: "Sessions et totaux",
    icon: "pump-medical",
    color: "#28a745",
    route: "/baby/pumping",
  },
  {
    title: "Santé",
    subtitle: "Température, symptômes, médicaments, vaccins",
    icon: "prescription-bottle",
    color: "#9C27B0",
    route: "/baby/soins",
  },
  {
    title: "Activités",
    subtitle: "Tummy time, jeux, lecture, promenade...",
    icon: "play-circle",
    color: "#10b981",
    route: "/baby/activities",
  },
  {
    title: "Jalons",
    subtitle: "Premiers moments et souvenirs",
    icon: "star",
    color: "#ec4899",
    route: "/baby/milestones",
  },
  {
    title: "Couches",
    subtitle: "Mictions et selles",
    icon: { lib: "mci", name: "human-baby-changing-table" },
    color: "#17a2b8",
    route: "/baby/diapers",
  },
  {
    title: "Routines",
    subtitle: "Sommeil, bain et routines rapides",
    icon: "bath",
    color: "#3b82f6",
    route: "/baby/routines",
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

      // Si c'est la route de gestion des accès, ajouter le childId
      if (route === "/baby/manage-access" && activeChild?.id) {
        router.push(`${route}?childId=${activeChild.id}` as any);
      } else {
        router.push(route as any);
      }
    },
    [activeChild?.id],
  );

  // Filtrer les items selon les permissions
  const visibleItems = ITEMS.filter((item) => {
    if ("ownerOnly" in item && item.ownerOnly) {
      return permissions.canManageAccess;
    }
    return true;
  });

  const isDark = colorScheme === "dark";

  return (
    <ThemedView style={styles.screen}>
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

          <View style={styles.list}>
            {visibleItems.length === 0 ? (
              <View style={styles.emptyState}>
                <FontAwesome
                  name="lock"
                  size={24}
                  color={nc.textMuted}
                />
                <Text style={[styles.emptyText, { color: nc.textLight }]}>
                  Aucun écran disponible avec vos permissions actuelles
                </Text>
              </View>
            ) : (
              visibleItems.map((item) => {
                const itemColor =
                  isDark && "darkColor" in item ? item.darkColor : item.color;
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
                        style={[styles.rowSubtitle, { color: nc.textLight }]}
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
              })
            )}
          </View>
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
    paddingTop: 12,
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
  },
  list: {
    paddingHorizontal: 20,
    gap: 12,
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
