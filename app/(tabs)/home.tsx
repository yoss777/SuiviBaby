import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { LinearGradient } from 'expo-linear-gradient';
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ecouterMictions } from "../../services/mictionsService";
import { ecouterPompages } from "../../services/pompagesService";
import { ecouterSelles } from "../../services/sellesService";
import { ecouterTetees } from "../../services/teteesService";

interface DashboardData {
  tetees: any[];
  pompages: any[];
  mictions: any[];
  selles: any[];
}

interface TodayStats {
  tetees: { count: number; quantity: number; lastTime?: string };
  pompages: { count: number; quantity: number; lastTime?: string };
  mictions: { count: number; lastTime?: string };
  selles: { count: number; lastTime?: string };
}

export default function HomeDashboard() {
  const [data, setData] = useState<DashboardData>({
    tetees: [],
    pompages: [],
    mictions: [],
    selles: [],
  });
  const [todayStats, setTodayStats] = useState<TodayStats>({
    tetees: { count: 0, quantity: 0 },
    pompages: { count: 0, quantity: 0 },
    mictions: { count: 0 },
    selles: { count: 0 },
  });

  // Écoute en temps réel de toutes les données
  useEffect(() => {
    const unsubscribeTetees = ecouterTetees((tetees) => {
      setData((prev) => ({ ...prev, tetees }));
    });
    const unsubscribePompages = ecouterPompages((pompages) => {
      setData((prev) => ({ ...prev, pompages }));
    });
    const unsubscribeMictions = ecouterMictions((mictions) => {
      setData((prev) => ({ ...prev, mictions }));
    });
    const unsubscribeSelles = ecouterSelles((selles) => {
      setData((prev) => ({ ...prev, selles }));
    });

    return () => {
      unsubscribeTetees();
      unsubscribePompages();
      unsubscribeMictions();
      unsubscribeSelles();
    };
  }, []);

  // Calcul des statistiques du jour
  useEffect(() => {
    const today = new Date();
    // Créer le début de journée dans le fuseau horaire local
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    // Créer la fin de journée dans le fuseau horaire local
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
        // Vérifier que l'item est dans la plage du jour local
        return itemDate >= startOfToday && itemDate < endOfToday;
      });

    const todayTetees = filterToday(data.tetees);
    const todayPompages = filterToday(data.pompages);
    const todayMictions = filterToday(data.mictions);
    const todaySelles = filterToday(data.selles);

    // Calculs pour tétées
    const teteesQuantity = todayTetees.reduce(
      (sum, t) =>
        sum +
        ((t.quantiteDroite || 0) + (t.quantiteGauche || 0) + (t.quantite || 0)),
      0
    );
    const lastTetee =
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

    const formatTime = (item: any) => {
      if (!item?.date?.seconds) return undefined;
      return new Date(item.date.seconds * 1000).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    setTodayStats({
      tetees: {
        count: todayTetees.length,
        quantity: teteesQuantity,
        lastTime: formatTime(lastTetee),
      },
      pompages: {
        count: todayPompages.length,
        quantity: pompagesQuantity,
        lastTime: formatTime(lastPompage),
      },
      mictions: {
        count: todayMictions.length,
        lastTime: formatTime(lastMiction),
      },
      selles: {
        count: todaySelles.length,
        lastTime: formatTime(lastSelle),
      },
    });
  }, [data]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  const getTimeSinceLastActivity = (lastTime?: string) => {
    if (!lastTime) return null;
    const now = new Date();
    const [hours, minutes] = lastTime.split(":").map(Number);
    const lastActivityTime = new Date();
    lastActivityTime.setHours(hours, minutes, 0, 0);

    const diffMs = now.getTime() - lastActivityTime.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0)
      return `il y a ${diffHours}h${
        diffMinutes > 0 ? ` ${diffMinutes}min` : ""
      }`;
    return `il y a ${diffMinutes}min`;
  };

  const QuickActionCard = ({
    title,
    icon,
    color,
    onPress,
    count,
    subtitle,
  }: any) => (
    <TouchableOpacity
      style={[styles.quickActionCard, { borderLeftColor: color }]}
      onPress={onPress}
    >
      <View style={styles.quickActionHeader}>
        <FontAwesome name={icon} size={24} color={color} />
        <View style={styles.quickActionContent}>
          <Text style={styles.quickActionTitle}>{title}</Text>
          <Text style={styles.quickActionSubtitle}>{subtitle}</Text>
        </View>
        {count > 0 && (
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const StatsCard = ({
    title,
    value,
    unit,
    icon,
    color,
    lastActivity,
  }: any) => (
    <View style={styles.statsCard}>
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
      {lastActivity && (
        <Text style={styles.statsTimeSince}>
          {getTimeSinceLastActivity(lastActivity)}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#f8f9fa', '#e9ecef', '#dee2e6']}
        style={styles.backgroundGradient}
      />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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
          <View style={styles.statsGrid}>
            <StatsCard
              title="Tétées"
              value={todayStats.tetees.count}
              unit={todayStats.tetees.count > 1 ? "sessions" : "session"}
              icon="baby"
              color="#4A90E2"
              lastActivity={todayStats.tetees.lastTime}
            />
            <StatsCard
              title="Volume consommé"
              value={todayStats.tetees.quantity}
              unit="ml"
              icon="tint"
              color="#4A90E2"
            />
          </View>
          <View style={styles.statsGrid}>
            <StatsCard
              title="Pompages"
              value={todayStats.pompages.count}
              unit={todayStats.pompages.count > 1 ? "sessions" : "session"}
              icon="pump-medical"
              color="#28a745"
              lastActivity={todayStats.pompages.lastTime}
            />
            <StatsCard
              title="Volume tiré"
              value={todayStats.pompages.quantity}
              unit="ml"
              icon="cloud-download-alt"
              color="#28a745"
            />
          </View>
        </View>

        {/* Activités physiologiques */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activités physiologiques</Text>
          <View style={styles.statsGrid}>
            <StatsCard
              title="Mictions"
              value={todayStats.mictions.count}
              unit="fois"
              icon="water"
              color="#17a2b8"
              lastActivity={todayStats.mictions.lastTime}
            />
            <StatsCard
              title="Selles"
              value={todayStats.selles.count}
              unit="fois"
              icon="poop"
              color="#dc3545"
              lastActivity={todayStats.selles.lastTime}
            />
          </View>
        </View>

        {/* Actions rapides */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.quickActionsContainer}>
            <QuickActionCard
              title="Nouvelle tétée"
              icon="baby"
              color="#4A90E2"
              count={todayStats.tetees.count}
              subtitle={
                todayStats.tetees.lastTime
                  ? `Dernière: ${todayStats.tetees.lastTime}`
                  : "Aucune aujourd'hui"
              }
              onPress={() => router.push("/tetees")}
            />
            <QuickActionCard
              title="Session tire-lait"
              icon="pump-medical"
              color="#28a745"
              count={todayStats.pompages.count}
              subtitle={
                todayStats.pompages.lastTime
                  ? `Dernière: ${todayStats.pompages.lastTime}`
                  : "Aucune aujourd'hui"
              }
              onPress={() => router.push("/pompages")}
            />
            <QuickActionCard
              title="Miction"
              icon="water"
              color="#17a2b8"
              count={todayStats.mictions.count}
              subtitle={
                todayStats.mictions.lastTime
                  ? `Dernière: ${todayStats.mictions.lastTime}`
                  : "Aucune aujourd'hui"
              }
              onPress={() => router.push("/mictions")}
            />
            <QuickActionCard
              title="Selle"
              icon="poop"
              color="#dc3545"
              count={todayStats.selles.count}
              subtitle={
                todayStats.selles.lastTime
                  ? `Dernière: ${todayStats.selles.lastTime}`
                  : "Aucune aujourd'hui"
              }
              onPress={() => router.push("/selles")}
            />
          </View>
        </View>

        {/* Lien vers les statistiques */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.statsButton}
            onPress={() => router.push("/stats")}
          >
            <FontAwesome name="chart-bar" size={20} color="#666" />
            <Text style={styles.statsButtonText}>
              Voir les statistiques détaillées
            </Text>
            <FontAwesome name="chevron-right" size={16} color="#666" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  scrollView: {
    flex: 1,
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
    marginBottom: 24,
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