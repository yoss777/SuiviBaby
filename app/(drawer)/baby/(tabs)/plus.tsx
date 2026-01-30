import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ITEMS = [
  {
    title: "Statistiques",
    subtitle: "Alimentation et expression du lait",
    icon: "chart-line",
    color: "#607D8B",
    route: "/baby/stats",
  },
  {
    title: "Repas",
    subtitle: "Biberons et tétées",
    icon: "baby",
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
    title: "Couches",
    subtitle: "Mictions et selles",
    icon: "toilet",
    color: "#17a2b8",
    route: "/baby/diapers",
  },
  {
    title: "Sommeil",
    subtitle: "Siestes et nuits",
    icon: "bed",
    color: "#6f42c1",
    route: "/baby/sommeil",
  },
];

export default function PlusScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const borderColor = `${colors.tabIconDefault}30`;
  const navLockRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      navLockRef.current = false;
    }, []),
  );

  const handleNavigate = useCallback((route: string) => {
    if (navLockRef.current) {
      return;
    }

    navLockRef.current = true;
    router.push(route as any);
  }, []);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Plus</Text>
          <Text style={[styles.subtitle, { color: colors.tabIconDefault }]}>
            Accès aux écrans détaillés
          </Text>
        </View>

        <View style={styles.list}>
          {ITEMS.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={[
                styles.row,
                { backgroundColor: colors.background, borderColor },
              ]}
              onPress={() => handleNavigate(item.route)}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: `${item.color}1A` },
                ]}
              >
                <FontAwesome
                  name={item.icon as any}
                  size={18}
                  color={item.color}
                />
              </View>
              <View style={styles.textBlock}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {item.title}
                </Text>
                <Text
                  style={[styles.rowSubtitle, { color: colors.tabIconDefault }]}
                >
                  {item.subtitle}
                </Text>
              </View>
              <FontAwesome
                name="chevron-right"
                size={14}
                color={colors.tabIconDefault}
              />
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  safeArea: {
    flex: 1,
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
});
