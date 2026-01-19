import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterEvenements,
  type Event,
  type EventType,
} from "@/services/eventsService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type SummaryType = "meals" | "pumping" | "diapers" | "immunos";

const SUMMARY_CONFIG: Record<
  SummaryType,
  {
    title: string;
    icon: string;
    color: string;
    route: string;
    eventTypes: EventType[];
  }
> = {
  meals: {
    title: "Repas",
    icon: "baby",
    color: "#4A90E2",
    route: "/baby/meals",
    eventTypes: ["tetee", "biberon"],
  },
  pumping: {
    title: "Tire-lait",
    icon: "pump-medical",
    color: "#28a745",
    route: "/baby/pumping",
    eventTypes: ["pompage"],
  },
  diapers: {
    title: "Couches",
    icon: "toilet",
    color: "#17a2b8",
    route: "/baby/diapers",
    eventTypes: ["miction", "selle"],
  },
  immunos: {
    title: "Immunos",
    icon: "prescription-bottle",
    color: "#9C27B0",
    route: "/baby/immunizations",
    eventTypes: ["vitamine", "vaccin"],
  },
};

const EVENT_CONFIG: Record<
  EventType,
  { label: string; icon: string; color: string }
> = {
  tetee: { label: "Tétée", icon: "person-breastfeeding", color: "#E91E63" },
  biberon: { label: "Biberon", icon: "jar-wheat", color: "#FF5722" },
  pompage: { label: "Pompage", icon: "pump-medical", color: "#28a745" },
  miction: { label: "Miction", icon: "droplet", color: "#17a2b8" },
  selle: { label: "Selle", icon: "poop", color: "#dc3545" },
  vitamine: { label: "Vitamine", icon: "pills", color: "#FF9800" },
  vaccin: { label: "Vaccin", icon: "syringe", color: "#9C27B0" },
  couche: { label: "Couche", icon: "baby", color: "#4A90E2" },
  sommeil: { label: "Sommeil", icon: "bed", color: "#6f42c1" },
};

const QUICK_ACTIONS: {
  key: SummaryType;
  label: string;
  icon: string;
  color: string;
  route: string;
}[] = [
  {
    key: "meals",
    label: "Repas",
    icon: "baby",
    color: "#4A90E2",
    route: "/baby/meals?openModal=true&returnTo=journal",
  },
  {
    key: "pumping",
    label: "Tire-lait",
    icon: "pump-medical",
    color: "#28a745",
    route: "/baby/pumping?openModal=true&returnTo=journal",
  },
  {
    key: "diapers",
    label: "Couches",
    icon: "toilet",
    color: "#17a2b8",
    route: "/baby/diapers?openModal=true&returnTo=journal",
  },
  {
    key: "immunos",
    label: "Santé",
    icon: "prescription-bottle",
    color: "#9C27B0",
    route: "/baby/immunizations?openModal=true&returnTo=journal",
  },
];

function toDate(value: any): Date {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildDetails(event: Event) {
  switch (event.type) {
    case "biberon":
      return event.quantite ? `${event.quantite} ml` : undefined;
    case "tetee": {
      const left = event.dureeGauche ? `G ${event.dureeGauche}m` : null;
      const right = event.dureeDroite ? `D ${event.dureeDroite}m` : null;
      const parts = [left, right].filter(Boolean);
      return parts.length > 0 ? parts.join(" • ") : undefined;
    }
    case "pompage": {
      const left = event.quantiteGauche ? `G ${event.quantiteGauche} ml` : null;
      const right = event.quantiteDroite
        ? `D ${event.quantiteDroite} ml`
        : null;
      const parts = [left, right].filter(Boolean);
      return parts.length > 0 ? parts.join(" • ") : undefined;
    }
    case "miction":
      return event.volume ? `${event.volume} ml` : event.couleur;
    case "selle":
      return event.consistance || event.couleur;
    default:
      return undefined;
  }
}

function sumNumber(values: (number | null | undefined)[]) {
  return values.reduce((sum, value) => sum + (value ?? 0), 0);
}

export default function JournalScreen() {
  const { activeChild } = useBaby();
  const { openSheet, closeSheet } = useSheet();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const borderColor = `${colors.tabIconDefault}30`;
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeChild?.id) return;
    const since = startOfDay(new Date());
    setLoading(true);
    const unsubscribe = ecouterEvenements(
      activeChild.id,
      (data) => {
        setEvents(data);
        setLoading(false);
      },
      { depuis: since, waitForServer: true },
    );
    return () => unsubscribe();
  }, [activeChild?.id]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime(),
      ),
    [events],
  );

  const recentEvents = useMemo(() => sortedEvents.slice(0, 8), [sortedEvents]);

  const summaryData = useMemo(() => {
    const byType = (types: EventType[]) =>
      events.filter((event) => types.includes(event.type));

    const meals = byType(SUMMARY_CONFIG.meals.eventTypes);
    const pumping = byType(SUMMARY_CONFIG.pumping.eventTypes);
    const diapers = byType(SUMMARY_CONFIG.diapers.eventTypes);
    const immunos = byType(SUMMARY_CONFIG.immunos.eventTypes);

    const lastTime = (list: Event[]) => {
      if (list.length === 0) return null;
      const latest = list.reduce((prev, current) =>
        toDate(current.date).getTime() > toDate(prev.date).getTime()
          ? current
          : prev,
      );
      return formatTime(toDate(latest.date));
    };

    return [
      {
        key: "meals",
        title: "Repas",
        primary: `Total repas : ${meals.length}`,
        secondary: `Tétée${byType(["tetee"]).length > 1 ? "s" : ""} : ${byType(["tetee"]).length} | Biberon${byType(["biberon"]).length > 1 ? "s" : ""} : ${byType(["biberon"]).length} `,
        tertiary: lastTime(meals)
          ? `Dernier : ${lastTime(meals)}`
          : "Aucun aujourd'hui",
      },
      {
        key: "pumping",
        title: "Tire-lait",
        primary: `Total tiré : ${sumNumber(
          pumping.map(
            (event) =>
              (event.quantiteGauche ?? 0) + (event.quantiteDroite ?? 0),
          ),
        )} ml`,
        secondary: lastTime(pumping)
          ? `Dernier : ${lastTime(pumping)}`
          : "Aucun aujourd'hui",
      },
      {
        key: "diapers",
        title: "Couches",
        primary: `Changes : ${diapers.length}`,
        secondary: `Pipi : ${byType(["miction"]).length} | Popo : ${byType(["selle"]).length}`,
        tertiary: lastTime(diapers)
          ? `Dernier : ${lastTime(diapers)}`
          : "Aucun aujourd'hui",
      },
      {
        key: "immunos",
        title: "Immunos",
        primary: `Aujourd'hui : ${immunos.length}`,
        secondary: lastTime(immunos)
          ? `Dernier : ${lastTime(immunos)}`
          : "Aucun aujourd'hui",
      },
    ];
  }, [events]);

  const handleOpenDetails = useCallback((key: SummaryType) => {
    const config = SUMMARY_CONFIG[key];
    router.push(config.route as any);
  }, []);

  const handleQuickAdd = useCallback(
    (route: string) => {
      closeSheet();
      router.push(route as any);
    },
    [closeSheet],
  );

  const openFabSheet = useCallback(() => {
    openSheet({
      ownerId: "journal",
      title: "Ajouter un évènement",
      icon: "plus",
      accentColor: colors.tint,
      showActions: false,
      onSubmit: () => {},
      children: (
        <View style={styles.sheetActions}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.sheetActionRow}
              onPress={() => handleQuickAdd(action.route)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.sheetActionIcon,
                  { backgroundColor: `${action.color}1A` },
                ]}
              >
                <FontAwesome
                  name={action.icon as any}
                  size={16}
                  color={action.color}
                />
              </View>
              <Text style={[styles.sheetActionText, { color: colors.text }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ),
      onDismiss: () => {},
    });
  }, [colors.text, colors.tint, handleQuickAdd, openSheet]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <View style={styles.container}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>
                Journal
              </Text>
              <Text style={[styles.subtitle, { color: colors.tabIconDefault }]}>
                {new Date().toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Synthèse d&apos;aujourd&apos;hui
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.summaryRow}
              >
                {summaryData.map((item) => {
                  const config = SUMMARY_CONFIG[item.key as SummaryType];
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.summaryCard,
                        { backgroundColor: colors.background },
                      ]}
                      onPress={() => handleOpenDetails(item.key as SummaryType)}
                      activeOpacity={0.9}
                    >
                      <View style={styles.summaryHeader}>
                        <View
                          style={[
                            styles.summaryIcon,
                            { backgroundColor: `${config.color}1A` },
                          ]}
                        >
                          <FontAwesome
                            name={config.icon as any}
                            size={16}
                            color={config.color}
                          />
                        </View>
                        <Text
                          style={[styles.summaryTitle, { color: colors.text }]}
                        >
                          {item.title}
                        </Text>
                      </View>
                      <Text
                        style={[styles.summaryPrimary, { color: colors.text }]}
                      >
                        {item.primary}
                      </Text>
                      <Text
                        style={[
                          styles.summarySecondary,
                          { color: colors.tabIconDefault },
                        ]}
                      >
                        {item.secondary}
                      </Text>
                      <Text
                        style={[
                          styles.summarySecondary,
                          { color: colors.tabIconDefault },
                        ]}
                      >
                        {item.tertiary}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Actions rapides
              </Text>
              <View style={styles.actionsRow}>
                {QUICK_ACTIONS.map((action) => (
                  <TouchableOpacity
                    key={action.key}
                    style={[styles.actionChip, { borderColor }]}
                    onPress={() => handleQuickAdd(action.route)}
                    activeOpacity={0.85}
                  >
                    <FontAwesome
                      name={action.icon as any}
                      size={18}
                      color={action.color}
                    />
                    <Text style={[styles.actionText, { color: colors.text }]}>
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Chronologie récente
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/(drawer)/baby/chrono")}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sectionLink, { color: colors.tint }]}>
                    Voir tout
                  </Text>
                </TouchableOpacity>
              </View>

              {loading ? (
                <Text
                  style={[styles.loadingText, { color: colors.tabIconDefault }]}
                >
                  Chargement...
                </Text>
              ) : recentEvents.length === 0 ? (
                <Text
                  style={[styles.emptyText, { color: colors.tabIconDefault }]}
                >
                  Aucun événement aujourd&apos;hui.
                </Text>
              ) : (
                recentEvents.map((event) => {
                  const config = EVENT_CONFIG[event.type];
                  const date = toDate(event.date);
                  const details = buildDetails(event);
                  return (
                    <View
                      key={event.id ?? `${event.type}-${event.date}`}
                      style={styles.recentRow}
                    >
                      <View style={styles.recentDotColumn}>
                        <View
                          style={[
                            styles.recentDot,
                            { backgroundColor: config?.color ?? colors.tint },
                          ]}
                        />
                      </View>
                      <View
                        style={[
                          styles.recentCard,
                          { backgroundColor: colors.background, borderColor },
                        ]}
                      >
                        <View style={styles.recentHeader}>
                          <View style={styles.recentTitleRow}>
                            <FontAwesome
                              name={config?.icon as any}
                              size={14}
                              color={config?.color ?? colors.tint}
                            />
                            <Text
                              style={[
                                styles.recentTitle,
                                { color: colors.text },
                              ]}
                            >
                              {config?.label ?? event.type}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.recentTime,
                              { color: colors.tabIconDefault },
                            ]}
                          >
                            {formatTime(date)}
                          </Text>
                        </View>
                        {details ? (
                          <Text
                            style={[
                              styles.recentDetails,
                              { color: colors.tabIconDefault },
                            ]}
                          >
                            {details}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.fab, { backgroundColor: colors.tint }]}
            onPress={openFabSheet}
            activeOpacity={0.9}
          >
            <FontAwesome name="plus" size={20} color={colors.background} />
          </TouchableOpacity>
        </View>
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
  container: {
    flex: 1,
    position: "relative",
  },
  scrollContent: {
    paddingBottom: 120,
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
    textTransform: "capitalize",
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: "600",
  },
  summaryRow: {
    gap: 12,
    paddingRight: 20,
    paddingTop: 6,
  },
  summaryCard: {
    width: 220,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#00000012",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  summaryPrimary: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  summarySecondary: {
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingTop: 6,
  },
  actionChip: {
    // flexDirection: "row",
    flex: 1,

    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  loadingText: {
    fontSize: 13,
  },
  emptyText: {
    fontSize: 13,
  },
  recentRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  recentDotColumn: {
    width: 16,
    alignItems: "center",
    paddingTop: 8,
  },
  recentDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
  },
  recentCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recentTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  recentTime: {
    fontSize: 12,
    fontWeight: "600",
  },
  recentDetails: {
    marginTop: 6,
    fontSize: 12,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  sheetActions: {
    gap: 12,
    paddingBottom: 12,
  },
  sheetActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  sheetActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetActionText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
