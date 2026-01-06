import { useBaby } from "@/contexts/BabyContext";
import { ecouterMictions } from "@/services/mictionsService";
import { ecouterPompages } from "@/services/pompagesService";
import { ecouterSelles } from "@/services/sellesService";
import { ecouterTetees } from "@/services/teteesService";
import { ecouterVaccins } from "@/services/vaccinsService";
import { ecouterVitamines } from "@/services/vitaminesService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface DashboardData {
  tetees: any[];
  pompages: any[];
  mictions: any[];
  selles: any[];
  vitamines: any[];
  vaccins: any[];
}

interface TodayStats {
  tetees: {
    total: {
      count: number;
      quantity: number;
      lastTime?: string;
      lastTimestamp?: number;
    };
    seins: {
      count: number;
      lastTime?: string;
      lastTimestamp?: number;
    };
    biberons: {
      count: number;
      quantity: number;
      lastTime?: string;
      lastTimestamp?: number;
    };
  };
  pompages: {
    count: number;
    quantity: number;
    lastTime?: string;
    lastTimestamp?: number;
  };
  mictions: { count: number; lastTime?: string; lastTimestamp?: number };
  selles: { count: number; lastTime?: string; lastTimestamp?: number };
  vitamines: { count: number; lastTime?: string; lastTimestamp?: number };
  vaccins: { count: number; lastTime?: string; lastTimestamp?: number };
}

export default function HomeDashboard() {
  const { activeChild } = useBaby();
  const [data, setData] = useState<DashboardData>({
    tetees: [],
    pompages: [],
    mictions: [],
    selles: [],
    vitamines: [],
    vaccins: [],
  });
  const [todayStats, setTodayStats] = useState<TodayStats>({
    tetees: {
      total: { count: 0, quantity: 0 },
      seins: { count: 0 },
      biberons: { count: 0, quantity: 0 },
    },
    pompages: { count: 0, quantity: 0 },
    mictions: { count: 0 },
    selles: { count: 0 },
    vitamines: { count: 0 },
    vaccins: { count: 0 },
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState({
    tetees: true,
    pompages: true,
    mictions: true,
    selles: true,
    vitamines: true,
    vaccins: true,
  });

  // Timer intelligent qui écoute les changements d'état de l'app
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const updateTime = () => {
      setCurrentTime(new Date());
      scheduleNextUpdate();
    };

    const scheduleNextUpdate = () => {
      if (timer) {
        clearTimeout(timer);
      }

      const now = new Date();
      const millisecondsUntilNextMinute =
        (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

      timer = setTimeout(() => {
        updateTime();
      }, millisecondsUntilNextMinute);
    };

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        updateTime();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    updateTime();

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      subscription?.remove();
    };
  }, []);

  // Écoute en temps réel de toutes les données
  useEffect(() => {
    if (!activeChild?.id) return;

    const unsubscribeTetees = ecouterTetees(activeChild.id, (tetees) => {
      setData((prev) => ({ ...prev, tetees }));
      setLoading((prev) => ({ ...prev, tetees: false }));
    });
    const unsubscribePompages = ecouterPompages(activeChild.id, (pompages) => {
      setData((prev) => ({ ...prev, pompages }));
      setLoading((prev) => ({ ...prev, pompages: false }));
    });
    const unsubscribeMictions = ecouterMictions(activeChild.id, (mictions) => {
      setData((prev) => ({ ...prev, mictions }));
      setLoading((prev) => ({ ...prev, mictions: false }));
    });
    const unsubscribeSelles = ecouterSelles(activeChild.id, (selles) => {
      setData((prev) => ({ ...prev, selles }));
      setLoading((prev) => ({ ...prev, selles: false }));
    });
    const unsubscribeVitamines = ecouterVitamines(activeChild.id, (vitamines) => {
      setData((prev) => ({ ...prev, vitamines }));
      setLoading((prev) => ({ ...prev, vitamines: false }));
    });
    const unsubscribeVaccins = ecouterVaccins(activeChild.id, (vaccins) => {
      setData((prev) => ({ ...prev, vaccins }));
      setLoading((prev) => ({ ...prev, vaccins: false }));
    });

    return () => {
      unsubscribeTetees();
      unsubscribePompages();
      unsubscribeMictions();
      unsubscribeSelles();
      unsubscribeVitamines();
      unsubscribeVaccins();
    };
  }, [activeChild]);

  // Calcul des statistiques du jour
  useEffect(() => {
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1
    );

    // Filtrer les entrées pour ne garder que celles d'aujourd'hui
    const filterToday = (items: any[]) =>
      items.filter((item) => {
        const itemDate = item.date?.seconds
          ? new Date(item.date.seconds * 1000)
          : new Date(item.date);
        return itemDate >= startOfToday && itemDate < endOfToday;
      });

    const todayTetees = filterToday(data.tetees);
    const todayPompages = filterToday(data.pompages);
    const todayMictions = filterToday(data.mictions);
    const todaySelles = filterToday(data.selles);
    const todayVitamines = filterToday(data.vitamines);
    const todayVaccins = filterToday(data.vaccins);

    // Séparer les tétées par type
    const seinsToday = todayTetees.filter((t) => !t.type || t.type === "seins");
    const biberonsToday = todayTetees.filter((t) => t.type === "biberons");

    // Calculs pour tétées seins
    const lastSeins =
      seinsToday.length > 0
        ? seinsToday.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest
          )
        : null;

    // Calculs pour tétées biberons
    const biberonsQuantity = biberonsToday.reduce(
      (sum, t) => sum + (t.quantite || 0),
      0
    );
    const lastBiberons =
      biberonsToday.length > 0
        ? biberonsToday.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest
          )
        : null;

    // Calculs totaux pour tétées
    const teteesTotalQuantity = biberonsQuantity; // Seuls les biberons ont une quantité mesurable
    const lastTeteeOverall =
      todayTetees.length > 0
        ? todayTetees.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest
          )
        : null;

    // Calculs pour pompages
    const pompagesQuantity = todayPompages.reduce(
      (sum, p) => sum + ((p.quantiteDroite || 0) + (p.quantiteGauche || 0)),
      0
    );
    const lastPompage =
      todayPompages.length > 0
        ? todayPompages.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest
          )
        : null;

    // Dernières activités
    const lastMiction =
      todayMictions.length > 0
        ? todayMictions.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest
          )
        : null;

    const lastSelle =
      todaySelles.length > 0
        ? todaySelles.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest
          )
        : null;

    const lastVitamine =
      todayVitamines.length > 0
        ? todayVitamines.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest
          )
        : null;

    const lastVaccin =
      todayVaccins.length > 0
        ? todayVaccins.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest
          )
        : null;

    const formatTime = (item: any) => {
      if (!item?.date?.seconds) return undefined;
      return new Date(item.date.seconds * 1000).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const getTimestamp = (item: any) => {
      if (!item?.date?.seconds) return undefined;
      return item.date.seconds * 1000;
    };

    setTodayStats({
      tetees: {
        total: {
          count: todayTetees.length,
          quantity: teteesTotalQuantity,
          lastTime: formatTime(lastTeteeOverall),
          lastTimestamp: getTimestamp(lastTeteeOverall),
        },
        seins: {
          count: seinsToday.length,
          lastTime: formatTime(lastSeins),
          lastTimestamp: getTimestamp(lastSeins),
        },
        biberons: {
          count: biberonsToday.length,
          quantity: biberonsQuantity,
          lastTime: formatTime(lastBiberons),
          lastTimestamp: getTimestamp(lastBiberons),
        },
      },
      pompages: {
        count: todayPompages.length,
        quantity: pompagesQuantity,
        lastTime: formatTime(lastPompage),
        lastTimestamp: getTimestamp(lastPompage),
      },
      mictions: {
        count: todayMictions.length,
        lastTime: formatTime(lastMiction),
        lastTimestamp: getTimestamp(lastMiction),
      },
      selles: {
        count: todaySelles.length,
        lastTime: formatTime(lastSelle),
        lastTimestamp: getTimestamp(lastSelle),
      },
      vitamines: {
        count: todayVitamines.length,
        lastTime: formatTime(lastVitamine),
        lastTimestamp: getTimestamp(lastVitamine),
      },
      vaccins: {
        count: todayVaccins.length,
        lastTime: formatTime(lastVaccin),
        lastTimestamp: getTimestamp(lastVaccin),
      },
    });
  }, [data]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  const getTimeSinceLastActivity = (lastTimestamp?: number) => {
    if (!lastTimestamp || isNaN(lastTimestamp)) return null;

    const now = new Date(currentTime.getTime());
    const actionTime = new Date(lastTimestamp);

    const nowTotalMinutes = Math.floor(now.getTime() / (1000 * 60));
    const actionTotalMinutes = Math.floor(actionTime.getTime() / (1000 * 60));

    const diffMinutes = nowTotalMinutes - actionTotalMinutes;

    if (diffMinutes < 0) return null;

    if (diffMinutes === 0) {
      return "à l'instant";
    }

    const diffHours = Math.floor(diffMinutes / 60);
    const remainingMinutes = diffMinutes % 60;

    if (diffHours > 0) {
      return `il y a ${diffHours}h${
        remainingMinutes > 0 ? ` ${remainingMinutes}min` : ""
      }`;
    }

    return `il y a ${diffMinutes}min`;
  };

  const StatsCard = ({
    title,
    value,
    unit,
    icon,
    color,
    lastActivity,
    lastTimestamp,
    onPress,
  }: any) => {
    const fourHours = 4 * 60 * 60 * 1000; // 4 heures en millisecondes
    const lastSessionDate = currentTime.getTime() - (lastTimestamp || 0);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.statsCard}
      >
        <View style={styles.statsHeader}>
          <FontAwesome name={icon} size={20} color={color} />
          <Text style={styles.statsTitle}>{title}</Text>
        </View>
        <Text style={[styles.statsValue, { color }]}>
          {value} {unit}
        </Text>
        {lastActivity && (
          <Text style={styles.statsLastActivity}>
            Dernière fois: {lastActivity}
          </Text>
        )}
        {title === "Pompages" && lastSessionDate > fourHours ? (
          <Text style={[styles.statsTimeSince, { color: "#dc3545" }]}>
            {getTimeSinceLastActivity(lastTimestamp)}
          </Text>
        ) : (
          lastTimestamp && (
            <Text style={styles.statsTimeSince}>
              {getTimeSinceLastActivity(lastTimestamp)}
            </Text>
          )
        )}
      </TouchableOpacity>
    );
  };
  const LoadingCard = () => (
    <View style={styles.statsCard}>
      <View style={[styles.statsHeader, { opacity: 0.5 }]}>
        <View
          style={{
            width: 20,
            height: 20,
            backgroundColor: "#e9ecef",
            borderRadius: 10,
          }}
        />
        <View
          style={{
            width: 60,
            height: 12,
            backgroundColor: "#e9ecef",
            borderRadius: 6,
          }}
        />
      </View>
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 10,
        }}
      >
        <ActivityIndicator size="small" color="#6c757d" />
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* En-tête avec salutation */}
      <View style={styles.header}>
        <Text style={styles.greeting}>{getGreeting()}</Text>
        <Text style={styles.date}>
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </Text>
      </View>

      {/* Résumé du jour */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{`Résumé d'aujourd'hui`}</Text>

        {/* Tétées & Pompages - Vue d'ensemble */}
        <View style={styles.statsGrid}>
          {loading.tetees ? (
            <>
              <LoadingCard />
            </>
          ) : (
            <>
              <StatsCard
                title="Tétées total"
                value={todayStats.tetees.total.count}
                unit={
                  todayStats.tetees.total.count > 1 ? "sessions" : "session"
                }
                icon="baby"
                color="#4A90E2"
                lastActivity={todayStats.tetees.total.lastTime}
                lastTimestamp={todayStats.tetees.total.lastTimestamp}
                onPress={() => router.push("/baby/stats?tab=tetees" as any)}
              />
            </>
          )}

          {loading.pompages ? (
            <>
              <LoadingCard />
            </>
          ) : (
            <>
              <StatsCard
                title="Pompages"
                value={`${todayStats.pompages.count} • ${todayStats.pompages.quantity}`}
                unit="ml"
                icon="pump-medical"
                color="#28a745"
                lastActivity={todayStats.pompages.lastTime}
                lastTimestamp={todayStats.pompages.lastTimestamp}
                onPress={() => router.push("/baby/pompages?openModal=true" as any)}
              />
            </>
          )}
        </View>

        {/* Tétées - Détail par type */}
        <View style={styles.statsGrid}>
          {loading.tetees ? (
            <>
              <LoadingCard />
              <LoadingCard />
            </>
          ) : (
            <>
              <StatsCard
                title="Seins"
                value={todayStats.tetees.seins.count}
                unit={todayStats.tetees.seins.count > 1 ? "fois" : "fois"}
                icon="person-breastfeeding"
                color="#E91E63"
                lastActivity={todayStats.tetees.seins.lastTime}
                lastTimestamp={todayStats.tetees.seins.lastTimestamp}
                onPress={() => router.push("/baby/tetees?tab=seins&openModal=true" as any)}
              />
              <StatsCard
                title="Biberons"
                value={`${todayStats.tetees.biberons.count} • ${todayStats.tetees.biberons.quantity}ml`}
                unit=""
                icon="jar-wheat"
                color="#FF5722"
                lastActivity={todayStats.tetees.biberons.lastTime}
                lastTimestamp={todayStats.tetees.biberons.lastTimestamp}
                onPress={() =>
                  router.push("/baby/tetees?tab=biberons&openModal=true" as any)
                }
              />
            </>
          )}
        </View>

        {/* Immunité et soins */}
        <View style={styles.statsGrid}>
          {loading.vitamines ? (
            <LoadingCard />
          ) : (
            <StatsCard
              title="Vitamines"
              value={todayStats.vitamines.count}
              unit={todayStats.vitamines.count > 1 ? "prises" : "prise"}
              icon="pills"
              color="#FF9800"
              lastActivity={todayStats.vitamines.lastTime}
              lastTimestamp={todayStats.vitamines.lastTimestamp}
              onPress={() =>
                router.push("/baby/immunos?tab=vitamines&openModal=true" as any)
              }
            />
          )}
          {loading.vaccins ? (
            <LoadingCard />
          ) : (
            <StatsCard
              title="Vaccins"
              value={todayStats.vaccins.count}
              unit={todayStats.vaccins.count > 1 ? "reçus" : "reçu"}
              icon="syringe"
              color="#9C27B0"
              lastActivity={todayStats.vaccins.lastTime}
              lastTimestamp={todayStats.vaccins.lastTimestamp}
              onPress={() => router.push("/baby/immunos?tab=vaccins&openModal=true" as any)}
            />
          )}
        </View>
      </View>

      {/* Activités physiologiques */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activités physiologiques</Text>
        <View style={styles.statsGrid}>
          {loading.mictions ? (
            <LoadingCard />
          ) : (
            <StatsCard
              title="Mictions"
              value={todayStats.mictions.count}
              unit="fois"
              icon="water"
              color="#17a2b8"
              lastActivity={todayStats.mictions.lastTime}
              lastTimestamp={todayStats.mictions.lastTimestamp}
              onPress={() =>
                router.push("/baby/excretions?tab=mictions&openModal=true" as any)
              }
            />
          )}
          {loading.selles ? (
            <LoadingCard />
          ) : (
            <StatsCard
              title="Selles"
              value={todayStats.selles.count}
              unit="fois"
              icon="poop"
              color="#dc3545"
              lastActivity={todayStats.selles.lastTime}
              lastTimestamp={todayStats.selles.lastTimestamp}
              onPress={() =>
                router.push("/baby/excretions?tab=selles&openModal=true" as any)
              }
            />
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    color: "#212529",
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    color: "#6c757d",
    textTransform: "capitalize",
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#212529",
    marginHorizontal: 20,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 12,
  },
  statsCard: {
    flex: 1,
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  statsTitle: {
    fontSize: 14,
    color: "#6c757d",
    fontWeight: "500",
  },
  statsValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  statsLastActivity: {
    fontSize: 12,
    color: "#6c757d",
  },
  statsTimeSince: {
    fontSize: 11,
    color: "#28a745",
    fontWeight: "500",
  },
  quickActionsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  quickActionCard: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#212529",
    marginBottom: 2,
  },
  quickActionSubtitle: {
    fontSize: 13,
    color: "#6c757d",
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  statsButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsButtonText: {
    flex: 1,
    fontSize: 16,
    color: "#495057",
    fontWeight: "500",
  },
});
