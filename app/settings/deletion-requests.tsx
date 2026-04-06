import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoModal } from "@/components/ui/InfoModal";
import { db } from "@/config/firebase";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  cancelChildDeletion,
  voteOnDeletionRequest,
} from "@/services/childDeletionService";

// ============================================
// TYPES
// ============================================

interface OwnerVote {
  vote: "pending" | "approved" | "refused";
  votedAt?: { seconds: number };
}

interface DeletionRequest {
  id: string;
  childId: string;
  childName: string;
  requestedBy: string;
  requestedByEmail: string;
  requestedAt: { seconds: number };
  status: "pending" | "approved" | "refused" | "expired" | "cancelled";
  ownerVotes: Record<string, OwnerVote>;
  refusedBy?: string;
  refusedByEmail?: string;
  seenByUserIds: string[];
}

// ============================================
// COMPONENT
// ============================================

export default function DeletionRequestsScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { user } = useAuth();
  const { showToast } = useToast();

  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [voteConfirm, setVoteConfirm] = useState<{
    visible: boolean;
    requestId: string;
    vote: "approved" | "refused";
    childName: string;
  } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState<{
    visible: boolean;
    requestId: string;
    childName: string;
  } | null>(null);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
  });
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Real-time listener for deletion requests where user is in ownerVotes
  useEffect(() => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Query requests where user is an owner, filter status client-side
    const q = query(
      collection(db, "childDeletionRequests"),
      where("ownerIds", "array-contains", user.uid),
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const results: DeletionRequest[] = [];
        const userIdsToResolve = new Set<string>();

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data() as Omit<DeletionRequest, "id">;
          // Show all except cancelled (terminated cleanly)
          if (data.status === "cancelled") continue;
          results.push({ id: docSnap.id, ...data });

          // Collect all owner userIds for name resolution
          Object.keys(data.ownerVotes).forEach((id) =>
            userIdsToResolve.add(id),
          );
          if (data.requestedBy) userIdsToResolve.add(data.requestedBy);
        }

        // Resolve display names
        const names: Record<string, string> = {};
        await Promise.all(
          Array.from(userIdsToResolve).map(async (userId) => {
            if (ownerNames[userId]) {
              names[userId] = ownerNames[userId];
              return;
            }
            try {
              const publicDoc = await getDoc(doc(db, "users_public", userId));
              names[userId] = publicDoc.exists()
                ? publicDoc.data()?.userName || userId.slice(0, 8) + "..."
                : userId.slice(0, 8) + "...";
            } catch {
              names[userId] = userId.slice(0, 8) + "...";
            }
          }),
        );

        if (!isMountedRef.current) return;

        // Sort: pending first, then by date desc
        results.sort((a, b) => {
          if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
          return (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0);
        });

        setRequests(results);
        setOwnerNames((prev) => ({ ...prev, ...names }));
        setIsLoading(false);
        setIsRefreshing(false);
      },
      (error) => {
        console.error("Erreur listener deletion requests:", error);
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      },
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const handlePullToRefresh = useCallback(() => {
    setIsRefreshing(true);
    // Listener will auto-update, just show spinner briefly
    setTimeout(() => {
      if (isMountedRef.current) setIsRefreshing(false);
    }, 1000);
  }, []);

  const handleVotePress = useCallback(
    (requestId: string, vote: "approved" | "refused", childName: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setVoteConfirm({ visible: true, requestId, vote, childName });
    },
    [],
  );

  const handleVoteConfirm = useCallback(async () => {
    if (!voteConfirm) return;
    const { requestId, vote, childName } = voteConfirm;
    setVoteConfirm(null);
    setIsVoting(true);

    try {
      const result = await voteOnDeletionRequest(requestId, vote);
      if (!isMountedRef.current) return;

      Haptics.notificationAsync(
        vote === "approved"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );

      if (result.status === "approved") {
        showToast(`${childName} sera supprime dans 30 jours`);
      } else if (result.status === "refused") {
        showToast("Suppression refusee");
      } else {
        showToast("Vote enregistre");
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible d'enregistrer le vote.",
      });
    } finally {
      if (isMountedRef.current) setIsVoting(false);
    }
  }, [voteConfirm, showToast]);

  const handleCancelPress = useCallback(
    (requestId: string, childName: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCancelConfirm({ visible: true, requestId, childName });
    },
    [],
  );

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelConfirm) return;
    const { requestId, childName } = cancelConfirm;
    setCancelConfirm(null);
    setIsCancelling(true);
    try {
      await cancelChildDeletion(requestId);
      if (!isMountedRef.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`Suppression de ${childName} annulee`);
    } catch {
      if (!isMountedRef.current) return;
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible d'annuler la suppression.",
      });
    } finally {
      if (isMountedRef.current) setIsCancelling(false);
    }
  }, [cancelConfirm, showToast]);

  const formatDate = (timestamp: { seconds: number } | undefined) => {
    if (!timestamp) return "";
    return new Date(timestamp.seconds * 1000).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const getVoteIcon = (
    vote: string,
  ): { name: keyof typeof Ionicons.glyphMap; color: string } => {
    switch (vote) {
      case "approved":
        return { name: "checkmark-circle", color: nc.success };
      case "refused":
        return { name: "close-circle", color: nc.error };
      default:
        return { name: "hourglass-outline", color: nc.textMuted };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "En attente";
      case "approved":
        return "Approuvee";
      case "refused":
        return "Refusee";
      case "expired":
        return "Expiree";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return nc.todayAccent;
      case "approved":
        return nc.success;
      case "refused":
        return nc.error;
      case "expired":
        return nc.textMuted;
      default:
        return nc.textMuted;
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <Stack.Screen
          options={{
            title: "Demandes de suppression",
            headerBackTitle: "Retour",
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handlePullToRefresh}
              tintColor={Colors[colorScheme].tint}
            />
          }
        >
          {isLoading ? (
            <View style={styles.centered} accessibilityLabel="Chargement des demandes" accessibilityRole="progressbar">
              <ActivityIndicator
                size="large"
                color={Colors[colorScheme].tint}
              />
            </View>
          ) : requests.length === 0 ? (
            <View style={styles.centered} accessible accessibilityRole="summary" accessibilityLabel="Aucune demande de suppression en cours">
              <Ionicons
                name="checkmark-circle-outline"
                size={48}
                color={nc.textMuted}
              />
              <Text style={[styles.emptyTitle, { color: nc.textStrong }]}>
                Aucune demande
              </Text>
              <Text style={[styles.emptyText, { color: nc.textMuted }]}>
                Pas de demande de suppression en cours.
              </Text>
            </View>
          ) : (
            <View style={styles.requestsList}>
              {requests.map((req) => {
                const userVote = req.ownerVotes[user?.uid || ""];
                const canVote =
                  req.status === "pending" &&
                  userVote?.vote === "pending" &&
                  !isVoting;
                const requesterName =
                  ownerNames[req.requestedBy] || req.requestedByEmail;

                return (
                  <View
                    key={req.id}
                    style={[
                      styles.requestCard,
                      { backgroundColor: nc.backgroundCard },
                    ]}
                    accessible
                    accessibilityRole="summary"
                    accessibilityLabel={`Demande de suppression de ${req.childName}, statut ${getStatusLabel(req.status)}, demandee par ${requesterName}`}
                  >
                    {/* Header */}
                    <View style={styles.requestHeader}>
                      <FontAwesome
                        name="trash-alt"
                        size={16}
                        color={getStatusColor(req.status)}
                      />
                      <Text
                        style={[
                          styles.requestChildName,
                          { color: nc.textStrong },
                        ]}
                      >
                        {req.childName}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: getStatusColor(req.status) + "20",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: getStatusColor(req.status) },
                          ]}
                        >
                          {getStatusLabel(req.status)}
                        </Text>
                      </View>
                    </View>

                    {/* Meta */}
                    <Text style={[styles.requestMeta, { color: nc.textMuted }]}>
                      Demandée le {formatDate(req.requestedAt)}
                    </Text>
                    <Text style={[styles.requestMeta, { color: nc.textMuted }]}>
                      par {requesterName}
                    </Text>

                    {/* Owner votes */}
                    <View style={styles.votesSection}>
                      <Text
                        style={[styles.votesLabel, { color: nc.textLight }]}
                      >
                        Votes des proprietaires :
                      </Text>
                      {Object.entries(req.ownerVotes).map(([ownerId, vote]) => {
                        const icon = getVoteIcon(vote.vote);
                        const name =
                          ownerId === user?.uid
                            ? "Vous"
                            : ownerNames[ownerId] ||
                              ownerId.slice(0, 8) + "...";
                        const suffix =
                          req.status === "refused" && vote.vote === "pending"
                            ? " (vote annule)"
                            : "";
                        const voteLabel = vote.vote === "approved" ? "a approuve" : vote.vote === "refused" ? "a refuse" : "en attente";
                        return (
                          <View
                            key={ownerId}
                            style={styles.voteRow}
                            accessible
                            accessibilityLabel={`${name}, ${voteLabel}${suffix}`}
                          >
                            <Ionicons
                              name={icon.name}
                              size={18}
                              color={icon.color}
                            />
                            <Text
                              style={[
                                styles.voteName,
                                { color: nc.textStrong },
                                vote.vote === "pending" &&
                                  req.status === "refused" && {
                                    color: nc.textMuted,
                                  },
                              ]}
                            >
                              {name}
                              {suffix}
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Action buttons — only if user can vote */}
                    {canVote && (
                      <View style={styles.voteActions}>
                        <TouchableOpacity
                          style={[styles.voteButton, { borderColor: nc.error }]}
                          onPress={() =>
                            handleVotePress(req.id, "refused", req.childName)
                          }
                          disabled={isVoting}
                          accessibilityRole="button"
                          accessibilityLabel={`Refuser la suppression de ${req.childName}`}
                          accessibilityState={{ disabled: isVoting }}
                        >
                          <Ionicons name="close" size={18} color={nc.error} />
                          <Text
                            style={[styles.voteButtonText, { color: nc.error }]}
                          >
                            Refuser
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.voteButton,
                            {
                              backgroundColor: nc.success,
                              borderColor: nc.success,
                            },
                          ]}
                          onPress={() =>
                            handleVotePress(req.id, "approved", req.childName)
                          }
                          disabled={isVoting}
                          accessibilityRole="button"
                          accessibilityLabel={`Approuver la suppression de ${req.childName}`}
                          accessibilityState={{ disabled: isVoting }}
                        >
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={nc.white}
                          />
                          <Text
                            style={[styles.voteButtonText, { color: nc.white }]}
                          >
                            Approuver
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Cancel button — only for approved (soft-deleted, within retention) */}
                    {req.status === "approved" && (
                      <TouchableOpacity
                        style={[
                          styles.cancelDeletionButton,
                          { borderColor: nc.todayAccent },
                        ]}
                        onPress={() => handleCancelPress(req.id, req.childName)}
                        disabled={isCancelling}
                        accessibilityRole="button"
                        accessibilityLabel={`Annuler la suppression de ${req.childName}`}
                        accessibilityState={{ disabled: isCancelling }}
                      >
                        <Ionicons
                          name="refresh"
                          size={16}
                          color={nc.todayAccent}
                        />
                        <Text
                          style={[
                            styles.cancelDeletionText,
                            { color: nc.todayAccent },
                          ]}
                        >
                          {isCancelling ? "..." : "Annuler la suppression"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Vote confirmation */}
        {voteConfirm && (
          <ConfirmModal
            visible={voteConfirm.visible}
            title={
              voteConfirm.vote === "approved"
                ? "Approuver la suppression ?"
                : "Refuser la suppression ?"
            }
            message={
              voteConfirm.vote === "approved"
                ? `Si tous les proprietaires approuvent, ${voteConfirm.childName} sera supprime apres 30 jours.`
                : `La demande sera annulee et les autres proprietaires seront informes.`
            }
            confirmText={
              voteConfirm.vote === "approved" ? "Approuver" : "Refuser"
            }
            cancelText="Annuler"
            backgroundColor={nc.backgroundCard}
            textColor={nc.textStrong}
            confirmButtonColor={
              voteConfirm.vote === "approved" ? nc.success : nc.error
            }
            confirmTextColor={nc.white}
            onConfirm={handleVoteConfirm}
            onCancel={() => setVoteConfirm(null)}
          />
        )}

        {/* Cancel deletion confirmation */}
        {cancelConfirm && (
          <ConfirmModal
            visible={cancelConfirm.visible}
            title="Annuler la suppression ?"
            message={`${cancelConfirm.childName} sera restaure et accessible a nouveau. Les autres proprietaires devront etre re-invites.`}
            confirmText="Restaurer"
            cancelText="Annuler"
            backgroundColor={nc.backgroundCard}
            textColor={nc.textStrong}
            confirmButtonColor={nc.todayAccent}
            confirmTextColor={nc.white}
            onConfirm={handleCancelConfirm}
            onCancel={() => setCancelConfirm(null)}
          />
        )}

        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={modalConfig.message}
          backgroundColor={nc.background}
          textColor={nc.textStrong}
          onClose={() =>
            setModalConfig((prev) => ({ ...prev, visible: false }))
          }
        />
      </SafeAreaView>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
  },
  requestsList: {
    gap: 12,
  },
  requestCard: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  requestChildName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  requestMeta: {
    fontSize: 13,
    lineHeight: 18,
  },
  votesSection: {
    gap: 6,
  },
  votesLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  voteName: {
    fontSize: 14,
    fontWeight: "500",
  },
  voteActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  voteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  voteButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  cancelDeletionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  cancelDeletionText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
