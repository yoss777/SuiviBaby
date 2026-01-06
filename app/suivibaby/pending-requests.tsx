import { getPendingRequests } from "@/services/babyAttachmentService";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface PendingRequest {
  id: string;
  simId: string;
  babyData?: {
    name: string;
    birthDate: string;
    gender?: "male" | "female";
  };
  parentEmail: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: any;
}

export default function PendingRequestsScreen() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [parentEmail, setParentEmail] = useState("parent@example.com"); // TODO: Récupérer depuis l'authentification

  const loadRequests = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const pendingRequests = await getPendingRequests(parentEmail);
      setRequests(pendingRequests);
    } catch (error) {
      console.error("Erreur lors du chargement des demandes:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const renderRequestItem = ({ item }: { item: PendingRequest }) => {
    const requestDate = new Date(
      item.requestedAt.seconds * 1000
    ).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <View style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <View style={styles.iconContainer}>
            <FontAwesome name="baby" size={24} color="#4A90E2" />
          </View>
          <View style={styles.requestInfo}>
            <Text style={styles.childName}>
              {item.babyData?.name || "Enfant"}
            </Text>
            <Text style={styles.simId}>ID SIM: {item.simId}</Text>
          </View>
        </View>

        <View style={styles.requestDetails}>
          <View style={styles.detailRow}>
            <FontAwesome name="calendar" size={14} color="#666" />
            <Text style={styles.detailText}>
              Demande envoyée le {requestDate}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <FontAwesome name="envelope" size={14} color="#666" />
            <Text style={styles.detailText}>{item.parentEmail}</Text>
          </View>
        </View>

        <View style={styles.statusContainer}>
          <View style={[styles.statusBadge, styles.statusPending]}>
            <FontAwesome name="clock" size={12} color="#856404" />
            <Text style={styles.statusText}>En attente de validation</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <FontAwesome name="info-circle" size={14} color="#0c5460" />
          <Text style={styles.infoText}>
            Vérifiez votre email et cliquez sur le lien de validation pour
            confirmer le rattachement
          </Text>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>Chargement des demandes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <FontAwesome name="clock" size={32} color="#4A90E2" />
        <Text style={styles.title}>Demandes en attente</Text>
        <Text style={styles.subtitle}>
          {requests.length} demande{requests.length > 1 ? "s" : ""} en attente
          de validation
        </Text>
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id || ""}
        renderItem={renderRequestItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadRequests(true)}
            colors={["#4A90E2"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FontAwesome name="check-circle" size={64} color="#28a745" />
            <Text style={styles.emptyTitle}>Aucune demande en attente</Text>
            <Text style={styles.emptyText}>
              Toutes vos demandes de rattachement ont été traitées
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  header: {
    alignItems: "center",
    padding: 24,
    paddingTop: 32,
    backgroundColor: "white",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#212529",
    marginTop: 12,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#6c757d",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  requestCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#e3f2fd",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  requestInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#212529",
    marginBottom: 4,
  },
  simId: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "monospace",
  },
  requestDetails: {
    gap: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  statusContainer: {
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  statusPending: {
    backgroundColor: "#fff3cd",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#856404",
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#d1ecf1",
    padding: 12,
    borderRadius: 8,
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#17a2b8",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#0c5460",
    lineHeight: 18,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginTop: 24,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
});
